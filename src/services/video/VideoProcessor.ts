import pLimit from 'p-limit';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { EncoderFactory } from './encoders/EncoderFactory';
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
          return { success: false, path: null, index, error: (error as Error).message };
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
        // Fast copy mode - no re-encoding
        await execFileAsync('ffmpeg', [
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListPath,
          '-c', 'copy',
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

        await execFileAsync('ffmpeg', [
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
      await execFileAsync('ffmpeg', [
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
      ]);

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
}
