"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncoderFactory = void 0;
const GPUEncoder_1 = require("./GPUEncoder");
const CPUEncoder_1 = require("./CPUEncoder");
/**
 * Factory for creating video encoders with GPU priority
 */
class EncoderFactory {
    preference;
    encoderCache = null;
    constructor(preference = 'auto') {
        this.preference = preference;
    }
    /**
     * Create the best available encoder based on preference
     */
    async createEncoder() {
        // Return cached encoder if available
        if (this.encoderCache) {
            return this.encoderCache;
        }
        let encoder;
        if (this.preference === 'cpu') {
            // User explicitly wants CPU
            console.log('[EncoderFactory] User preference: CPU');
            encoder = new CPUEncoder_1.CPUEncoder();
        }
        else if (this.preference === 'gpu') {
            // User explicitly wants GPU, try GPU or fail to CPU
            console.log('[EncoderFactory] User preference: GPU, detecting...');
            const gpuType = await this.detectGPU();
            if (gpuType) {
                console.log(`[EncoderFactory] ✅ GPU detected: ${gpuType.toUpperCase()}`);
                encoder = new GPUEncoder_1.GPUEncoder(gpuType);
                if (await encoder.isAvailable()) {
                    console.log(`[EncoderFactory] ✅ GPU encoder available: ${encoder.name}`);
                    this.encoderCache = encoder;
                    return encoder;
                }
                else {
                    console.warn(`[EncoderFactory] ⚠️ GPU encoder NOT available, falling back to CPU`);
                }
            }
            else {
                console.warn('[EncoderFactory] ⚠️ No GPU detected, falling back to CPU');
            }
            // GPU not available, fallback to CPU
            encoder = new CPUEncoder_1.CPUEncoder();
        }
        else {
            // Auto mode: try GPU first, fallback to CPU
            console.log('[EncoderFactory] Auto mode, trying GPU first...');
            const gpuType = await this.detectGPU();
            if (gpuType) {
                const gpuEncoder = new GPUEncoder_1.GPUEncoder(gpuType);
                if (await gpuEncoder.isAvailable()) {
                    console.log(`[EncoderFactory] ✅ Using GPU: ${gpuType.toUpperCase()}`);
                    encoder = gpuEncoder;
                    this.encoderCache = encoder;
                    return encoder;
                }
            }
            console.log('[EncoderFactory] Using CPU encoder');
            // No GPU available, use CPU
            encoder = new CPUEncoder_1.CPUEncoder();
        }
        this.encoderCache = encoder;
        return encoder;
    }
    /**
     * Detect available GPU type
     * Priority: NVIDIA -> AMD -> null
     */
    async detectGPU() {
        // Try NVIDIA first
        const nvidiaEncoder = new GPUEncoder_1.GPUEncoder('nvidia');
        if (await nvidiaEncoder.isAvailable()) {
            return 'nvidia';
        }
        // Try AMD
        const amdEncoder = new GPUEncoder_1.GPUEncoder('amd');
        if (await amdEncoder.isAvailable()) {
            return 'amd';
        }
        return null;
    }
    /**
     * Clear cached encoder (useful for testing)
     */
    clearCache() {
        this.encoderCache = null;
    }
}
exports.EncoderFactory = EncoderFactory;
//# sourceMappingURL=EncoderFactory.js.map