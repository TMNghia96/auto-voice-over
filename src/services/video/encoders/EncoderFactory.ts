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
      console.log('[EncoderFactory] User preference: CPU');
      encoder = new CPUEncoder();
    } else if (this.preference === 'gpu') {
      // User explicitly wants GPU, try GPU or fail to CPU
      console.log('[EncoderFactory] User preference: GPU, detecting...');
      const gpuType = await this.detectGPU();
      if (gpuType) {
        console.log(`[EncoderFactory] ✅ GPU detected: ${gpuType.toUpperCase()}`);
        encoder = new GPUEncoder(gpuType);
        if (await encoder.isAvailable()) {
          console.log(`[EncoderFactory] ✅ GPU encoder available: ${encoder.name}`);
          this.encoderCache = encoder;
          return encoder;
        } else {
          console.warn(`[EncoderFactory] ⚠️ GPU encoder NOT available, falling back to CPU`);
        }
      } else {
        console.warn('[EncoderFactory] ⚠️ No GPU detected, falling back to CPU');
      }
      // GPU not available, fallback to CPU
      encoder = new CPUEncoder();
    } else {
      // Auto mode: try GPU first, fallback to CPU
      console.log('[EncoderFactory] Auto mode, trying GPU first...');
      const gpuType = await this.detectGPU();
      if (gpuType) {
        const gpuEncoder = new GPUEncoder(gpuType);
        if (await gpuEncoder.isAvailable()) {
          console.log(`[EncoderFactory] ✅ Using GPU: ${gpuType.toUpperCase()}`);
          encoder = gpuEncoder;
          this.encoderCache = encoder;
          return encoder;
        }
      }
      console.log('[EncoderFactory] Using CPU encoder');
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
