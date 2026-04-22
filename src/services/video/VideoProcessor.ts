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

    // Create encoder
    const encoder = await this.encoderFactory.createEncoder();
    
    // Determine concurrency based on encoder type
    const concurrency = encoder.type === 'gpu' ? 6 : 2;
    const limit = pLimit(concurrency);

    let completedCount = 0;
    const outputPaths: string[] = [];

    // Process segments in parallel
    const encodePromises = segments.map((segment, index) =>
      limit(async () => {
        const result = await this.encodeSegmentWithRetry(
          encoder,
          segment,
          index,
          originalVideo,
          tempDir
        );

        completedCount++;
        onProgress(completedCount / segments.length);

        return result.outputPath;
      })
    );

    const results = await Promise.all(encodePromises);
    return results;
  }

  /**
   * Encode a segment with retry logic and GPU->CPU fallback
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

        // On first failure with GPU, try CPU fallback
        if (attempt === 1 && currentEncoder.type === 'gpu') {
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
   */
  async concatenateVideo(
    segmentPaths: string[],
    outputPath: string
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

    // Run FFmpeg concat
    try {
      await execFileAsync('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-y',
        outputPath,
      ]);

      // Clean up concat list
      await fs.unlink(concatListPath).catch(() => {});

      return true;
    } catch (error) {
      throw new Error(`Failed to concatenate video: ${(error as Error).message}`);
    }
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

    // Run FFmpeg mux
    try {
      await execFileAsync('ffmpeg', [
        '-i', videoPath,
        '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
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
