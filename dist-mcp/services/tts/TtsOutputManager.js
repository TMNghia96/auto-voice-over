"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtsOutputManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class TtsOutputManager {
    outputDir;
    constructor(projectPath) {
        this.outputDir = path_1.default.join(projectPath, 'audio_gene');
    }
    get dir() {
        return this.outputDir;
    }
    ensureExists() {
        if (!fs_1.default.existsSync(this.outputDir)) {
            fs_1.default.mkdirSync(this.outputDir, { recursive: true });
        }
    }
    /** Remove old mp3/wav files before a fresh generation */
    clearSegments() {
        if (!fs_1.default.existsSync(this.outputDir))
            return;
        const oldFiles = fs_1.default.readdirSync(this.outputDir)
            .filter((f) => f.endsWith('.mp3') || f.endsWith('.wav'));
        for (const f of oldFiles) {
            try {
                fs_1.default.unlinkSync(path_1.default.join(this.outputDir, f));
            }
            catch (err) {
                console.warn(`Failed to delete old file ${f}:`, err);
            }
        }
    }
    segmentPath(index) {
        const fileName = `${String(index).padStart(4, '0')}.mp3`;
        return path_1.default.join(this.outputDir, fileName);
    }
    listSegments() {
        if (!fs_1.default.existsSync(this.outputDir))
            return [];
        return fs_1.default.readdirSync(this.outputDir)
            .filter((f) => f.endsWith('.mp3') || f.endsWith('.wav'))
            .sort()
            .map((f) => ({
            name: f,
            path: path_1.default.join(this.outputDir, f),
        }));
    }
    readSegment(filePath) {
        try {
            if (!fs_1.default.existsSync(filePath))
                return null;
            const buffer = fs_1.default.readFileSync(filePath);
            const ext = path_1.default.extname(filePath).toLowerCase();
            const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
            const base64 = buffer.toString('base64');
            return `data:${mime};base64,${base64}`;
        }
        catch {
            return null;
        }
    }
}
exports.TtsOutputManager = TtsOutputManager;
//# sourceMappingURL=TtsOutputManager.js.map