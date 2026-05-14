import pLimit from 'p-limit';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile, spawn, exec } from 'child_process';
import { promisify } from 'util';
import { EncoderFactory } from './encoders/EncoderFactory';
import { getFfmpegPath, getFfprobePath } from '../EnvironmentService';
import { SegmentValidator } from './SegmentValidator';
import { VideoEncoder } from './encoders/VideoEncoder';
import {
  ValidatedSegment,
  EncodeResult,
  EncodeOptions,
  VideoProcessorConfig,
  DEFAULT_VIDEO_CONFIG,
} from './types';

const execFileAsync = promisify(execFile);

/**
 * Processes video segments with parallel encoding, retry logic, and GPU fallback
 */
export class VideoProcessor {
  private readonly config: VideoProcessorConfig;

  constructor(
    private readonly encoderFactory: EncoderFactory,
    private readonly validator: SegmentValidator,
    config?: Partial<VideoProcessorConfig>
  ) {
    this.config = { ...DEFAULT_VIDEO_CONFIG, ...config };
  }

  /**
   * Process video segments in parallel with progress reporting
   */
  async processVideoSegments(
    segments: ValidatedSegment[],
    originalVideo: string,
    tempDir: string,
    onProgress: (progress: number) => void
  ): Promise<string[]> {
    if (segments.length === 0) {
      return [];
    }

    // Create encoder - force GPU if preference is set
    const encoder = await this.encoderFactory.createEncoder();
    
    console.log(`[VideoProcessor] Using ${encoder.type.toUpperCase()} encoder: ${encoder.name}`);
    
    // Determine concurrency based on encoder type
    const concurrency = encoder.type === 'gpu' ? 6 : 2;
    const limit = pLimit(concurrency);

    let completedCount = 0;
    const outputPaths: string[] = [];

    // Process segments in parallel
    const encodePromises = segments.map((segment, index) =>
      limit(async () => {
        try {
          const result = await this.encodeSegmentWithRetry(
            encoder,
            segment,
            index,
            originalVideo,
            tempDir
          );

          completedCount++;
          onProgress(completedCount / segments.length);

          return { success: true, path: result.outputPath, index };
        } catch (error) {
          completedCount++;
          onProgress(completedCount / segments.length);
          
          console.error(`Segment ${index} failed permanently:`, error);
          return { success: false, path: null as string | null, index, error: (error as Error).message };
        }
      })
    );

    const results = await Promise.all(encodePromises);
    
    // Check for failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.error(`${failures.length}/${segments.length} segments failed to encode`);
      failures.slice(0, 5).forEach(f => {
        console.error(`  - Segment ${f.index}: ${f.error}`);
      });
      throw new Error(`Failed to encode ${failures.length} segments. First error: ${failures[0].error}`);
    }
    
    return results.map(r => r.path!);
  }

  /**
   * Encode a segment with retry logic (NO GPU->CPU fallback if GPU is forced)
   */
  private async encodeSegmentWithRetry(
    encoder: VideoEncoder,
    segment: ValidatedSegment,
    index: number,
    originalVideo: string,
    tempDir: string
  ): Promise<EncodeResult> {
    const outputPath = path.join(tempDir, `segment_${index}.mp4`);

    const encodeOptions: EncodeOptions = {
      startTime: segment.videoStart,
      duration: segment.videoDuration,
      videoSpeed: segment.adjustedVideoSpeed,
      fps: 30,
      crf: 23,
      preset: 'medium',
    };

    console.log(`[VideoProcessor] Encoding segment ${index}:`, {
      startTime: encodeOptions.startTime.toFixed(2),
      duration: encodeOptions.duration.toFixed(2),
      speed: encodeOptions.videoSpeed.toFixed(2),
      encoder: encoder.name
    });

    let lastError: Error | null = null;
    let currentEncoder = encoder;

    // Retry loop
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await currentEncoder.encodeSegment(
          originalVideo,
          outputPath,
          encodeOptions
        );

        if (result.success) {
          return result;
        }

        lastError = new Error(result.error || 'Encode failed');
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Segment ${index} encode attempt ${attempt}/${this.config.maxRetries} failed:`,
          lastError.message
        );

        // Only fallback to CPU if preference is 'auto'
        if (attempt === 1 && currentEncoder.type === 'gpu' && this.config.encoderPreference === 'auto') {
          console.log(`Segment ${index}: Falling back to CPU encoder`);
          const cpuFactory = new EncoderFactory('cpu');
          currentEncoder = await cpuFactory.createEncoder();
          continue;
        }

        // Exponential backoff before retry
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to encode segment ${index} after ${this.config.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Concatenate video segments using FFmpeg concat demuxer
   * Uses copy mode for already-muxed segments (fast)
   */
  async concatenateVideo(
    segmentPaths: string[],
    outputPath: string,
    useCopy: boolean = true
  ): Promise<boolean> {
    if (segmentPaths.length === 0) {
      throw new Error('No segment paths provided for concatenation');
    }

    // Single segment - just copy
    if (segmentPaths.length === 1) {
      await fs.copyFile(segmentPaths[0], outputPath);
      return true;
    }

    // Create concat list file
    const tempDir = path.dirname(outputPath);
    const concatListPath = path.join(tempDir, 'concat_list.txt');

    const concatContent = segmentPaths
      .map(p => `file '${p.replace(/\\/g, '/')}'`)
      .join('\n');

    await fs.writeFile(concatListPath, concatContent, 'utf-8');

    console.log(`[Concat] Concatenating ${segmentPaths.length} segments with ${useCopy ? 'copy' : 're-encode'} mode`);

    // Run FFmpeg concat
    try {
      if (useCopy) {
        // Fast copy mode with fps filter to ensure CFR
        await this.spawnFfmpeg([
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          '-vf', 'fps=30',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '18',
          '-c:a', 'copy',
          '-y',
          outputPath,
        ]);
      } else {
        // Re-encode mode (for segments without audio or mismatched formats)
        const encoder = await this.encoderFactory.createEncoder();
        const useGPU = encoder.type === 'gpu';
        
        console.log(`[Concat] Using ${useGPU ? 'GPU' : 'CPU'} encoder for re-encoding`);

        const videoArgs = useGPU
          ? ['-c:v', encoder.name, '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '18']
          : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18'];

        await this.spawnFfmpeg([
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          ...videoArgs,
          '-r', '30',
          '-vsync', 'cfr',
          '-c:a', 'copy',
          '-y',
          outputPath,
        ]);
      }

      // Clean up concat list
      await fs.unlink(concatListPath).catch(() => {});

      return true;
    } catch (error) {
      throw new Error(`Failed to concatenate video: ${(error as Error).message}`);
    }
  }

  /**
   * Mux each video segment with its corresponding audio segment
   * This ensures perfect sync by muxing before concatenation
   */
  async muxSegmentsWithAudio(
    videoSegmentPaths: string[],
    audioSegmentPaths: string[],
    tempDir: string,
    onProgress: (progress: number) => void
  ): Promise<string[]> {
    if (videoSegmentPaths.length !== audioSegmentPaths.length) {
      throw new Error(`Segment count mismatch: ${videoSegmentPaths.length} video vs ${audioSegmentPaths.length} audio`);
    }

    const limit = pLimit(4); // Mux 4 segments at a time
    const muxedPaths: string[] = [];
    let completed = 0;

    const muxPromises = videoSegmentPaths.map((videoPath, index) =>
      limit(async () => {
        const audioPath = audioSegmentPaths[index];
        const muxedPath = path.join(tempDir, `muxed_${index}.mp4`);

        await this.muxSegmentWithRetry(
          videoPath,
          audioPath,
          muxedPath,
          index,
          this.config.maxRetries
        );

        completed++;
        onProgress(completed / videoSegmentPaths.length);

        return muxedPath;
      })
    );

    const results = await Promise.all(muxPromises);
    return results;
  }

  /**
   * Mux a single segment with retry logic
   */
  private async muxSegmentWithRetry(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    index: number,
    maxRetries: number = 3
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await execFileAsync('ffmpeg', [
          '-i', videoPath,
          '-i', audioPath,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          '-y',
          outputPath,
        ]);

        return; // Success
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Segment ${index} mux attempt ${attempt}/${maxRetries} failed:`,
          lastError.message
        );

        if (attempt < maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to mux segment ${index} after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Mux video with audio using FFmpeg
   */
  async muxWithAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<boolean> {
    // Verify input files exist
    try {
      await fs.access(videoPath);
      await fs.access(audioPath);
    } catch (error) {
      throw new Error(`Input file not found: ${(error as Error).message}`);
    }

    // Run FFmpeg mux with proper sync flags
    try {
      await execFileAsync(getFfmpegPath(), [
        '-i', videoPath,
        '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-map', '0:v:0',      // Map video from first input
        '-map', '1:a:0',      // Map audio from second input
        '-async', '1',        // Audio sync method
        '-vsync', 'cfr',      // Constant frame rate
        '-y',
        outputPath,
      ], { maxBuffer: 10 * 1024 * 1024 });

      return true;
    } catch (error) {
      throw new Error(`Failed to mux video with audio: ${(error as Error).message}`);
    }
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getMediaDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      const ffprobe = getFfprobePath();
      const proc = spawn(ffprobe, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        filePath,
      ], { windowsHide: true });

      let stdout = '';
      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.on('close', () => {
        const d = parseFloat(stdout.trim());
        resolve(Number.isFinite(d) ? d : 0);
      });
      proc.on('error', () => resolve(0));
    });
  }

  /**
   * Spawn ffmpeg with streaming stderr (no maxBuffer limit)
   */
  private spawnFfmpeg(args: string[], timeoutMs: number = 600000): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
      let lastStderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        lastStderr = (lastStderr + data.toString()).slice(-1024);
      });
      const timer = setTimeout(() => {
        if (process.platform === 'win32' && proc.pid) {
          exec(`taskkill /pid ${proc.pid} /t /f`);
        } else {
          try { proc.kill('SIGKILL'); } catch {}
        }
        reject(new Error(`FFmpeg timeout after ${timeoutMs}ms: ${lastStderr.slice(-200)}`));
      }, timeoutMs);
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) { resolve(); }
        else { reject(new Error(`FFmpeg exit ${code}: ${lastStderr.slice(-500)}`)); }
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });
    });
  }

  /**
   * Process video chunks (merged consecutive same-speed segments)
   * @param forceEncode - when true, encodes ALL chunks (non-H264 source needs unified codec)
   */
  async processVideoChunks(
    chunks: Array<{ videoStart: number; videoEnd: number; videoDuration: number; adjustedVideoSpeed: number }>,
    originalVideo: string,
    tempDir: string,
    onProgress: (progress: number) => void,
    forceEncode: boolean = false
  ): Promise<string[]> {
    if (chunks.length === 0) return [];
    const needEncode = chunks;
    console.log(`[VideoProcessor] Chunks: ${chunks.length} total, ${needEncode.length} encode, 0 copy (safe render mode)`);

    let encoder: VideoEncoder | null = null;
    if (needEncode.length > 0) {
      encoder = await this.encoderFactory.createEncoder();
      console.log(`[VideoProcessor] Using ${encoder.type.toUpperCase()} encoder: ${encoder.name}`);
    }

    const encodeLimit = encoder ? pLimit(encoder.type === 'gpu' ? 4 : 2) : pLimit(1);
    let completed = 0;
    const outputPaths: string[] = new Array(chunks.length);

    const promises = chunks.map((chunk, index) => {
      const executor = encodeLimit;
      return executor(async () => {
        try {
          const out = path.join(tempDir, `chunk_${String(index).padStart(4, '0')}.mp4`);
          console.log(`[VideoProcessor] Encode chunk ${index}: start=${chunk.videoStart.toFixed(2)} dur=${chunk.videoDuration.toFixed(2)} speed=${chunk.adjustedVideoSpeed.toFixed(2)}`);
          await this.encodeChunk(encoder!, chunk, index, originalVideo, out);

          const expectedDuration = chunk.videoDuration / Math.max(chunk.adjustedVideoSpeed, 0.001);
          const actualDuration = await this.getMediaDuration(out);
          if (actualDuration > 0 && Math.abs(actualDuration - expectedDuration) > 0.3) {
            console.warn(
              `Chunk ${index} duration mismatch: expected ${expectedDuration.toFixed(3)}s, got ${actualDuration.toFixed(3)}s (non-fatal)`
            );
          }

          completed++;
          onProgress(completed / chunks.length);
          outputPaths[index] = out;
        } catch (error) {
          completed++;
          onProgress(completed / chunks.length);
          console.error(`Chunk ${index} failed:`, error);
          throw error;
        }
      });
    });
    await Promise.all(promises);
    return outputPaths;
  }

  private async copyChunk(
    originalVideo: string, outputPath: string,
    startTime: number, duration: number, index: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await execFileAsync(getFfmpegPath(), [
          '-ss', startTime.toFixed(3), '-t', duration.toFixed(3),
          '-i', originalVideo, '-c', 'copy', '-y', outputPath,
        ], { timeout: 30000 });
        const stats = await fs.stat(outputPath);
        if (stats.size > 0) return;
        console.warn(`[VideoProcessor] Copy chunk ${index} attempt ${attempt}: empty output`);
      } catch (error) {
        console.warn(`[VideoProcessor] Copy chunk ${index} attempt ${attempt} failed:`, (error as Error).message);
      }
      if (attempt < this.config.maxRetries) await this.sleep(this.config.retryDelay * Math.pow(2, attempt - 1));
    }
    throw new Error(`Failed to copy chunk ${index} after ${this.config.maxRetries} attempts`);
  }

  private async encodeChunk(
    encoder: VideoEncoder, chunk: any, index: number,
    originalVideo: string, outputPath: string
  ): Promise<void> {
    const opts: EncodeOptions = {
      startTime: chunk.videoStart, duration: chunk.videoDuration,
      videoSpeed: chunk.adjustedVideoSpeed, fps: 30, crf: 23, preset: 'medium',
    };
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const r = await encoder.encodeSegment(originalVideo, outputPath, opts);
        if (r.success) return;
        console.warn(`[VideoProcessor] Encode chunk ${index} attempt ${attempt}: ${r.error}`);
      } catch (error) {
        console.warn(`[VideoProcessor] Encode chunk ${index} attempt ${attempt}:`, (error as Error).message);
      }
      if (attempt < this.config.maxRetries) await this.sleep(this.config.retryDelay * Math.pow(2, attempt - 1));
    }
    throw new Error(`Failed to encode chunk ${index} after ${this.config.maxRetries} attempts`);
  }

  /**
   * Concat with stream copy (no re-encode) — instant for H264 source
   */
  async concatenateCopy(segmentPaths: string[], outputPath: string): Promise<void> {
    const tempDir = path.dirname(outputPath);
    const listPath = path.join(tempDir, 'concat_list.txt');
    const content = segmentPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    await fs.writeFile(listPath, content, 'utf-8');
    console.log(`[Concat Copy] Concatenating ${segmentPaths.length} segments (stream copy)`);
    await this.spawnFfmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', outputPath], 60000);
    await fs.unlink(listPath).catch(() => {});
  }
}
