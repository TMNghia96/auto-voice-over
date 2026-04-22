import { execFile } from 'child_process';
import { promisify } from 'util';
import { stat } from 'fs/promises';
import { VideoEncoder } from './VideoEncoder';
import { EncodeOptions, EncodeResult } from '../types';

const execFileAsync = promisify(execFile);

/**
 * GPU-accelerated video encoder supporting AMD and NVIDIA
 */
export class GPUEncoder implements VideoEncoder {
  readonly name: string;
  readonly type = 'gpu' as const;
  private readonly codec: string;
  private availabilityCache: boolean | null = null;

  constructor(private readonly gpuType: 'amd' | 'nvidia') {
    this.name = gpuType === 'amd' ? 'h264_amf' : 'h264_nvenc';
    this.codec = this.name;
  }

  /**
   * Check if GPU encoder is available by running a test encode
   */
  async isAvailable(): Promise<boolean> {
    if (this.availabilityCache !== null) {
      return this.availabilityCache;
    }

    try {
      // Test encode with null output to verify GPU availability
      const { stderr } = await execFileAsync('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'color=black:s=64x64:d=0.1',
        '-c:v', this.codec,
        '-f', 'null',
        '-'
      ], { timeout: 5000 });

      // Check for success (no error messages about codec not found)
      const available = !stderr.includes('Unknown encoder') && 
                       !stderr.includes('Encoder not found') &&
                       !stderr.includes('No NVENC capable devices found') &&
                       !stderr.includes('AMF encoder not available');
      
      this.availabilityCache = available;
      return available;
    } catch (error) {
      this.availabilityCache = false;
      return false;
    }
  }

  /**
   * Encode a video segment using GPU acceleration
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

      await execFileAsync('ffmpeg', args, { 
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000 
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
   * Get FFmpeg encoder arguments for GPU encoding
   */
  getEncoderArgs(options: EncodeOptions): string[] {
    const speedFilter = options.videoSpeed !== 1.0 
      ? `setpts=${(1 / options.videoSpeed).toFixed(6)}*PTS`
      : null;

    const args = [
      '-c:v', this.codec,
      '-preset', options.preset,
      '-r', options.fps.toString()
    ];

    // Add video filter if needed
    if (speedFilter) {
      args.push('-vf', speedFilter);
    }

    // GPU encoders use quality parameter instead of CRF
    if (this.gpuType === 'nvidia') {
      args.push('-cq', options.crf.toString());
    } else {
      // AMD uses quality parameter
      args.push('-quality', 'balanced');
    }

    return args;
  }
}
