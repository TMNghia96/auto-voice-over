"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtRepository = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class SrtRepository {
    projectPath;
    constructor(projectPath) {
        this.projectPath = projectPath;
    }
    get translateDir() {
        return path_1.default.join(this.projectPath, 'translate');
    }
    srtPath(lang) {
        return path_1.default.join(this.translateDir, `${lang}.srt`);
    }
    exists(lang) {
        return fs_1.default.existsSync(this.srtPath(lang));
    }
    load(lang) {
        const filePath = this.srtPath(lang);
        if (!fs_1.default.existsSync(filePath))
            return null;
        try {
            return fs_1.default.readFileSync(filePath, 'utf-8');
        }
        catch (err) {
            console.error(`Failed to load SRT for ${lang}:`, err);
            return null;
        }
    }
    save(lang, content) {
        if (!fs_1.default.existsSync(this.translateDir)) {
            fs_1.default.mkdirSync(this.translateDir, { recursive: true });
        }
        const filePath = this.srtPath(lang);
        fs_1.default.writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }
    findAvailableLanguage(langs) {
        for (const lang of langs) {
            const content = this.load(lang);
            if (content)
                return { lang, content };
        }
        return null;
    }
}
exports.SrtRepository = SrtRepository;
//# sourceMappingURL=SrtRepository.js.map