"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPUEncoder = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const promises_1 = require("fs/promises");
const EnvironmentService_1 = require("../../EnvironmentService");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * CPU-based video encoder using libx264
 */
class CPUEncoder {
    name = 'libx264';
    type = 'cpu';
    /**
     * CPU encoder is always available
     */
    async isAvailable() {
        return true;
    }
    /**
     * Encode a video segment using CPU
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
                timeout: 600000 // 10 min for CPU encoding
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
     * Get FFmpeg encoder arguments for CPU encoding
     */
    getEncoderArgs(options) {
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
exports.CPUEncoder = CPUEncoder;
//# sourceMappingURL=CPUEncoder.js.map