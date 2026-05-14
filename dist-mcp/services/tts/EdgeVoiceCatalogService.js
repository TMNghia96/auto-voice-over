"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchEdgeVoices = fetchEdgeVoices;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const msedge_tts_1 = require("msedge-tts");
const VoiceCatalog_1 = require("./VoiceCatalog");
const CACHE_FILE = path_1.default.join(process.cwd(), '.auto-voice-over', 'edge-voices-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
function normalizeGender(input) {
    if (input === 'Male' || input === 'Female')
        return input;
    return 'Neutral';
}
function toVoiceOption(dto) {
    if (!dto.ShortName || !dto.Locale)
        return null;
    const language = dto.Locale.split('-')[0]?.toLowerCase();
    if (!language)
        return null;
    return {
        id: dto.ShortName,
        name: dto.ShortName.replace(/Neural$/i, ''),
        gender: normalizeGender(dto.Gender),
        language,
        label: dto.ShortName,
        isPreset: false,
    };
}
function readCache() {
    try {
        if (!fs_1.default.existsSync(CACHE_FILE))
            return null;
        const raw = fs_1.default.readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.voices) || typeof parsed.cachedAt !== 'number')
            return null;
        if (Date.now() - parsed.cachedAt > CACHE_TTL_MS)
            return null;
        return parsed.voices;
    }
    catch {
        return null;
    }
}
function writeCache(voices) {
    const dir = path_1.default.dirname(CACHE_FILE);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    fs_1.default.writeFileSync(CACHE_FILE, JSON.stringify({ cachedAt: Date.now(), voices }, null, 2));
}
async function fetchEdgeVoices() {
    const cached = readCache();
    if (cached)
        return cached;
    const tts = new msedge_tts_1.MsEdgeTTS();
    const allVoices = (await tts.getVoices());
    const supportedLangs = new Set((0, VoiceCatalog_1.getSupportedLanguages)());
    const mapped = allVoices
        .map(toVoiceOption)
        .filter((v) => !!v)
        .filter((v) => supportedLangs.has(v.language));
    const deduped = Array.from(new Map(mapped.map((v) => [v.id, v])).values())
        .sort((a, b) => a.label.localeCompare(b.label));
    writeCache(deduped);
    return deduped;
}
//# sourceMappingURL=EdgeVoiceCatalogService.js.map