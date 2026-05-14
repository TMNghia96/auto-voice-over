"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdgeTtsEngine = void 0;
const fs_1 = __importDefault(require("fs"));
const msedge_tts_1 = require("msedge-tts");
class EdgeTtsEngine {
    engineId = 'edge-tts';
    async synthesize(text, voiceId) {
        const tts = new msedge_tts_1.MsEdgeTTS();
        await tts.setMetadata(voiceId, msedge_tts_1.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(text);
        return audioStream;
    }
    async close() {
        // MsEdgeTTS instances are created per-request and closed via stream end
    }
    /**
     * Synthesize to a file. Returns true on success, false on failure.
     */
    async synthesizeToFile(text, voiceId, outputPath, timeoutMs = 30000) {
        const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleanText) {
            console.log(`Skipping empty text for ${outputPath}`);
            return false;
        }
        try {
            const tts = new msedge_tts_1.MsEdgeTTS();
            await tts.setMetadata(voiceId, msedge_tts_1.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
            const { audioStream } = tts.toStream(cleanText);
            return new Promise((resolve) => {
                const writeStream = fs_1.default.createWriteStream(outputPath);
                let hasData = false;
                let finalized = false;
                const done = (success) => {
                    if (finalized)
                        return;
                    finalized = true;
                    clearTimeout(timer);
                    resolve(success);
                };
                const timer = setTimeout(() => {
                    console.error(`Timeout ${timeoutMs}ms for ${outputPath}`);
                    audioStream.destroy();
                    writeStream.end(() => {
                        tts.close();
                        if (fs_1.default.existsSync(outputPath))
                            fs_1.default.unlinkSync(outputPath);
                        done(false);
                    });
                }, timeoutMs);
                audioStream.on('data', (chunk) => {
                    hasData = true;
                    writeStream.write(chunk);
                });
                audioStream.on('end', () => {
                    writeStream.end(() => {
                        tts.close();
                        if (hasData && fs_1.default.existsSync(outputPath)) {
                            const stat = fs_1.default.statSync(outputPath);
                            if (stat.size > 0) {
                                done(true);
                            }
                            else {
                                fs_1.default.unlinkSync(outputPath);
                                done(false);
                            }
                        }
                        else {
                            if (fs_1.default.existsSync(outputPath))
                                fs_1.default.unlinkSync(outputPath);
                            done(false);
                        }
                    });
                });
                audioStream.on('error', (err) => {
                    console.error(`Edge TTS stream error for ${outputPath}:`, err);
                    writeStream.end(() => {
                        tts.close();
                        if (fs_1.default.existsSync(outputPath))
                            fs_1.default.unlinkSync(outputPath);
                        done(false);
                    });
                });
            });
        }
        catch (err) {
            console.error(`Edge TTS error for ${outputPath}:`, err);
            if (fs_1.default.existsSync(outputPath))
                fs_1.default.unlinkSync(outputPath);
            return false;
        }
    }
}
exports.EdgeTtsEngine = EdgeTtsEngine;
//# sourceMappingURL=EdgeTtsEngine.js.map