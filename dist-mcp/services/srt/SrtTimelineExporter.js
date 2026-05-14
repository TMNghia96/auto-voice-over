"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtTimelineExporter = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SrtOptimizer_1 = require("../../lib/SrtOptimizer");
class SrtTimelineExporter {
    /**
     * Export a translated SRT with timestamps adjusted to the final video timeline.
     *
     * Non-fatal: if the translated SRT content is empty or unparseable,
     * returns outputPath with empty content but does not throw.
     *
     * @param validatedSegments   Segment array from SegmentValidator.validateAndAdjust()
     * @param translatedSrtContent Raw SRT string content of the translated subtitles
     * @param outputPath           Full path where the adjusted SRT file will be written
     * @returns                    The outputPath that was written
     */
    export(validatedSegments, translatedSrtContent, outputPath) {
        const translatedEntries = (0, SrtOptimizer_1.parseSrt)(translatedSrtContent);
        const textMap = new Map();
        for (const entry of translatedEntries) {
            textMap.set(entry.index, entry.text);
        }
        const srtEntries = [];
        let currentTimeMs = 0;
        for (const seg of validatedSegments) {
            const speed = seg.adjustedVideoSpeed || seg.videoSpeed || 1.0;
            const outputDurationMs = (seg.videoDuration / speed) * 1000;
            if (seg.type === 'dubbed' && seg.index != null) {
                const text = textMap.get(seg.index);
                if (text) {
                    srtEntries.push({
                        index: srtEntries.length + 1,
                        startTime: (0, SrtOptimizer_1.msToTime)(currentTimeMs),
                        endTime: (0, SrtOptimizer_1.msToTime)(currentTimeMs + outputDurationMs),
                        text,
                    });
                }
            }
            currentTimeMs += outputDurationMs;
        }
        const outputDir = path_1.default.dirname(outputPath);
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        const content = (0, SrtOptimizer_1.stringifySrt)(srtEntries);
        fs_1.default.writeFileSync(outputPath, content, 'utf-8');
        return outputPath;
    }
}
exports.SrtTimelineExporter = SrtTimelineExporter;
//# sourceMappingURL=SrtTimelineExporter.js.map