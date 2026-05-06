import fs from 'fs';
import path from 'path';
import { ValidatedSegment } from '../video/types';
import { SrtEntry, parseSrt, stringifySrt, msToTime } from '../../lib/SrtOptimizer';

export class SrtTimelineExporter {
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
    export(
        validatedSegments: ValidatedSegment[],
        translatedSrtContent: string,
        outputPath: string
    ): string {
        const translatedEntries = parseSrt(translatedSrtContent);

        const textMap = new Map<number, string>();
        for (const entry of translatedEntries) {
            textMap.set(entry.index, entry.text);
        }

        const srtEntries: SrtEntry[] = [];
        let currentTimeMs = 0;

        for (const seg of validatedSegments) {
            const speed = seg.adjustedVideoSpeed || seg.videoSpeed || 1.0;
            const outputDurationMs = (seg.videoDuration / speed) * 1000;

            if (seg.type === 'dubbed' && seg.index != null) {
                const text = textMap.get(seg.index);
                if (text) {
                    srtEntries.push({
                        index: srtEntries.length + 1,
                        startTime: msToTime(currentTimeMs),
                        endTime: msToTime(currentTimeMs + outputDurationMs),
                        text,
                    });
                }
            }

            currentTimeMs += outputDurationMs;
        }

        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const content = stringifySrt(srtEntries);
        fs.writeFileSync(outputPath, content, 'utf-8');

        return outputPath;
    }
}
