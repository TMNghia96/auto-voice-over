import { EncodeOptions, EncodeResult } from '../types';

/**
 * Interface for video encoders (GPU and CPU implementations)
 */
export interface VideoEncoder {
  readonly name: string;
  readonly type: 'gpu' | 'cpu';
  
  /**
   * Check if this encoder is available on the system
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Encode a video segment with the given options
   */
  encodeSegment(
    inputVideo: string,
    outputPath: string,
    options: EncodeOptions
  ): Promise<EncodeResult>;
  
  /**
   * Get FFmpeg encoder arguments for this encoder
   */
  getEncoderArgs(options: EncodeOptions): string[];
}
