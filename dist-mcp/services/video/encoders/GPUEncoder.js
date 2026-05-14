"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GPUEncoder = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const promises_1 = require("fs/promises");
const EnvironmentService_1 = require("../../EnvironmentService");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * GPU-accelerated video encoder supporting AMD and NVIDIA
 */
class GPUEncoder {
    gpuType;
    name;
    type = 'gpu';
    codec;
    availabilityCache = null;
    constructor(gpuType) {
        this.gpuType = gpuType;
        this.name = gpuType === 'amd' ? 'h264_amf' : 'h264_nvenc';
        this.codec = this.name;
    }
    /**
     * Check if GPU encoder is available by running a test encode
     */
    async isAvailable() {
        if (this.availabilityCache !== null) {
            return this.availabilityCache;
        }
        try {
            // Test encode with null output to verify GPU availability
            // Use 256x256 instead of 64x64 - AMD AMF requires minimum 128x128
            const { stderr } = await execFileAsync((0, EnvironmentService_1.getFfmpegPath)(), [
                '-f', 'lavfi',
                '-i', 'color=black:s=256x256:d=0.1',
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
        }
        catch (error) {
            this.availabilityCache = false;
            return false;
        }
    }
    /**
     * Encode a video segment using GPU acceleration
     */
    async encodeSegment(inputVideo, outputPath, options) {
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
            await execFileAsync((0, EnvironmentService_1.getFfmpegPath)(), args, {
                maxBuffer: 10 * 1024 * 1024,
                timeout: 300000 // 5 min for 4K video
            });
            // Get output file stats
            const stats = await (0, promises_1.stat)(outputPath);
            const duration = (Date.now() - startTime) / 1000;
            return {
                success: true,
                outputPath,
                fileSize: stats.size,
                duration
            };
        }
        catch (error) {
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
    getEncoderArgs(options) {
        const videoFilter = Math.abs(options.videoSpeed - 1.0) > 0.001
            ? `setpts=${(1 / options.videoSpeed).toFixed(6)}*(PTS-STARTPTS),fps=${options.fps}`
            : `setpts=PTS-STARTPTS,fps=${options.fps}`;
        const args = [
            '-an',
            '-c:v', this.codec,
            '-vf', videoFilter,
            '-r', options.fps.toString(),
            '-g', (options.fps * 2).toString(), // Keyframe every 2 seconds for smooth concat
            '-keyint_min', options.fps.toString() // Min keyframe interval
        ];
        // Add preset for NVIDIA only (AMD doesn't support preset)
        if (this.gpuType === 'nvidia') {
            args.push('-preset', options.preset);
        }
        // GPU encoders use quality parameter instead of CRF
        if (this.gpuType === 'nvidia') {
            args.push('-cq', options.crf.toString());
        }
        else {
            // AMD uses quality parameter (speed, balanced, quality)
            args.push('-quality', 'balanced');
            args.push('-rc', 'cqp');
            args.push('-qp_i', '23');
            args.push('-qp_p', '23');
        }
        return args;
    }
}
exports.GPUEncoder = GPUEncoder;
//# sourceMappingURL=GPUEncoder.js.map