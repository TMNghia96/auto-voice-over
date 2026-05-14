"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoicePreviewService = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const PREVIEW_SUBDIR = '.auto-voice-over/previews';
class VoicePreviewService {
    engine;
    projectPath;
    constructor(engine, projectPath) {
        this.engine = engine;
        this.projectPath = projectPath;
    }
    get previewsDir() {
        return path_1.default.join(this.projectPath, PREVIEW_SUBDIR);
    }
    static selectRandomEntries(entries, count) {
        if (entries.length <= 4) {
            return entries.slice();
        }
        const middle = entries.slice(2, entries.length - 2);
        const shuffled = [...middle].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }
    async generatePreview(entries, voiceId, sampleCount = 3) {
        const previewsDir = path_1.default.join(this.previewsDir, voiceId);
        const cachePath = path_1.default.join(previewsDir, 'cache.json');
        if (fs_1.default.existsSync(cachePath)) {
            try {
                const cached = JSON.parse(fs_1.default.readFileSync(cachePath, 'utf-8'));
                const age = Date.now() - cached.cachedAt;
                if (age < 24 * 60 * 60 * 1000) {
                    return { voiceId: cached.voiceId, samples: cached.samples };
                }
            }
            catch {
                // cache corrupt, regenerate
            }
        }
        const selected = VoicePreviewService.selectRandomEntries(entries, sampleCount);
        const samples = [];
        for (const entry of selected) {
            const fileName = `preview_${entry.index}.mp3`;
            const audioPath = path_1.default.join(previewsDir, fileName);
            const success = await this.engine.synthesizeToFile(entry.text, voiceId, audioPath);
            samples.push({
                index: entry.index,
                text: entry.text,
                audioPath: success ? audioPath : undefined,
            });
        }
        const cacheEntry = {
            voiceId,
            samples,
            cachedAt: Date.now(),
        };
        if (!fs_1.default.existsSync(previewsDir)) {
            fs_1.default.mkdirSync(previewsDir, { recursive: true });
        }
        fs_1.default.writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));
        return { voiceId, samples };
    }
    cleanupOldPreviews() {
        const dir = this.previewsDir;
        if (!fs_1.default.existsSync(dir))
            return;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const voiceDirs = fs_1.default.readdirSync(dir);
        for (const voiceDir of voiceDirs) {
            const cacheFile = path_1.default.join(dir, voiceDir, 'cache.json');
            if (fs_1.default.existsSync(cacheFile)) {
                try {
                    const stat = fs_1.default.statSync(cacheFile);
                    if (now - stat.mtimeMs > sevenDays) {
                        const voiceDirPath = path_1.default.join(dir, voiceDir);
                        for (const file of fs_1.default.readdirSync(voiceDirPath)) {
                            fs_1.default.unlinkSync(path_1.default.join(voiceDirPath, file));
                        }
                        fs_1.default.rmdirSync(voiceDirPath);
                    }
                }
                catch (err) {
                    console.warn(`Failed to cleanup preview cache for ${voiceDir}:`, err);
                }
            }
        }
    }
}
exports.VoicePreviewService = VoicePreviewService;
//# sourceMappingURL=VoicePreviewService.js.map