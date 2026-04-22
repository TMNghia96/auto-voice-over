import { VideoEncoder } from './VideoEncoder';
import { GPUEncoder } from './GPUEncoder';
import { CPUEncoder } from './CPUEncoder';

/**
 * Factory for creating video encoders with GPU priority
 */
export class EncoderFactory {
  private encoderCache: VideoEncoder | null = null;

  constructor(
    private readonly preference: 'gpu' | 'cpu' | 'auto' = 'auto'
  ) {}

  /**
   * Create the best available encoder based on preference
   */
  async createEncoder(): Promise<VideoEncoder> {
    // Return cached encoder if available
    if (this.encoderCache) {
      return this.encoderCache;
    }

    let encoder: VideoEncoder;

    if (this.preference === 'cpu') {
      // User explicitly wants CPU
      encoder = new CPUEncoder();
    } else if (this.preference === 'gpu') {
      // User explicitly wants GPU, try GPU or fail to CPU
      const gpuType = await this.detectGPU();
      if (gpuType) {
        encoder = new GPUEncoder(gpuType);
        if (await encoder.isAvailable()) {
          this.encoderCache = encoder;
          return encoder;
        }
      }
      // GPU not available, fallback to CPU
      encoder = new CPUEncoder();
    } else {
      // Auto mode: try GPU first, fallback to CPU
      const gpuType = await this.detectGPU();
      if (gpuType) {
        const gpuEncoder = new GPUEncoder(gpuType);
        if (await gpuEncoder.isAvailable()) {
          encoder = gpuEncoder;
          this.encoderCache = encoder;
          return encoder;
        }
      }
      // No GPU available, use CPU
      encoder = new CPUEncoder();
    }

    this.encoderCache = encoder;
    return encoder;
  }

  /**
   * Detect available GPU type
   * Priority: NVIDIA -> AMD -> null
   */
  private async detectGPU(): Promise<'nvidia' | 'amd' | null> {
    // Try NVIDIA first
    const nvidiaEncoder = new GPUEncoder('nvidia');
    if (await nvidiaEncoder.isAvailable()) {
      return 'nvidia';
    }

    // Try AMD
    const amdEncoder = new GPUEncoder('amd');
    if (await amdEncoder.isAvailable()) {
      return 'amd';
    }

    return null;
  }

  /**
   * Clear cached encoder (useful for testing)
   */
  clearCache(): void {
    this.encoderCache = null;
  }
}
