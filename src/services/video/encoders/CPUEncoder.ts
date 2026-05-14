import { execFile } from 'child_process';
import { promisify } from 'util';
import { stat } from 'fs/promises';
import { VideoEncoder } from './VideoEncoder';
import { EncodeOptions, EncodeResult } from '../types';
import { getFfmpegPath } from '../../EnvironmentService';

const execFileAsync = promisify(execFile);

/**
 * CPU-based video encoder using libx264
 */
export class CPUEncoder implements VideoEncoder {
  readonly name = 'libx264';
  readonly type = 'cpu' as const;

  /**
   * CPU encoder is always available
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Encode a video segment using CPU
   */
  async encodeSegment(
    inputVideo: string,
    outputPath: string,
    options: EncodeOptions
  ): Promise<EncodeResult> {
    const startTime = Date.now();

    try {
      const args = [
        '-ss', options.startTime.toFixed(3),
        '-t', options.duration.toFixed(3),
        '-i', inputVideo,
        ...this.getEncoderArgs(options),
        '-y',
        outputPath
      ];

      await execFileAsync(getFfmpegPath(), args, { 
        maxBuffer: 10 * 1024 * 1024,
        timeout: 600000 // 10 min for CPU encoding
      });

      // Get output file stats
      const stats = await stat(outputPath);
      const duration = (Date.now() - startTime) / 1000;

      return {
        success: true,
        outputPath,
        fileSize: stats.size,
        duration
      };
    } catch (error) {
      return {
        success: false,
        outputPath,
        fileSize: 0,
        duration: (Date.now() - startTime) / 1000,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get FFmpeg encoder arguments for CPU encoding
   */
  getEncoderArgs(options: EncodeOptions): string[] {
    const videoFilter = Math.abs(options.videoSpeed - 1.0) > 0.001
      ? `setpts=${(1 / options.videoSpeed).toFixed(6)}*(PTS-STARTPTS),fps=${options.fps}`
      : `setpts=PTS-STARTPTS,fps=${options.fps}`;

    const args = [
      '-an',
      '-c:v', 'libx264',
      '-preset', options.preset,
      '-crf', options.crf.toString(),
      '-vf', videoFilter,
      '-r', options.fps.toString(),
      '-g', (options.fps * 2).toString(), // Keyframe every 2 seconds for smooth concat
      '-keyint_min', options.fps.toString() // Min keyframe interval
    ];

    return args;
  }
}
