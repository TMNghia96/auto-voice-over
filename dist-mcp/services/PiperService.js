"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllVoicesForLanguage = exports.getPresetsForLanguage = exports.getVoiceById = exports.ALL_VOICES = exports.VOICE_PRESETS = exports.generateAllAudio = exports.cleanupOldPreviews = exports.generateVoicePreview = exports.selectRandomEntries = exports._internal = exports.generateAudioSegment = exports.engine = exports.VOICE_MAP = void 0;
exports.categorizeError = categorizeError;
const path_1 = __importDefault(require("path"));
const EdgeTtsEngine_1 = require("./tts/EdgeTtsEngine");
const TtsOrchestrator_1 = require("./tts/TtsOrchestrator");
const VoicePreviewService_1 = require("./tts/VoicePreviewService");
const TtsOutputManager_1 = require("./tts/TtsOutputManager");
const TtsErrorClassifier_1 = require("./tts/TtsErrorClassifier");
const VoiceCatalog_1 = require("./tts/VoiceCatalog");
Object.defineProperty(exports, "VOICE_PRESETS", { enumerable: true, get: function () { return VoiceCatalog_1.VOICE_PRESETS; } });
Object.defineProperty(exports, "ALL_VOICES", { enumerable: true, get: function () { return VoiceCatalog_1.ALL_VOICES; } });
Object.defineProperty(exports, "getVoiceById", { enumerable: true, get: function () { return VoiceCatalog_1.getVoiceById; } });
Object.defineProperty(exports, "getPresetsForLanguage", { enumerable: true, get: function () { return VoiceCatalog_1.getPresetsForLanguage; } });
Object.defineProperty(exports, "getAllVoicesForLanguage", { enumerable: true, get: function () { return VoiceCatalog_1.getAllVoicesForLanguage; } });
exports.VOICE_MAP = {
    vi: { voice: 'vi-VN-NamMinhNeural', label: '🇻🇳 Tiếng Việt - NamMinh' },
    zh: { voice: 'zh-CN-XiaoxiaoNeural', label: '🇨🇳 中文 - Xiaoxiao' },
    ja: { voice: 'ja-JP-NanamiNeural', label: '🇯🇵 日本語 - Nanami' },
    ko: { voice: 'ko-KR-SunHiNeural', label: '🇰🇷 한국어 - SunHi' },
    fr: { voice: 'fr-FR-DeniseNeural', label: '🇫🇷 Français - Denise' },
    de: { voice: 'de-DE-KatjaNeural', label: '🇩🇪 Deutsch - Katja' },
    es: { voice: 'es-ES-ElviraNeural', label: '🇪🇸 Español - Elvira' },
    pt: { voice: 'pt-BR-FranciscaNeural', label: '🇧🇷 Português - Francisca' },
    ru: { voice: 'ru-RU-SvetlanaNeural', label: '🇷🇺 Русский - Svetlana' },
    en: { voice: 'en-US-JennyNeural', label: '🇺🇸 English - Jenny' },
    th: { voice: 'th-TH-PremwadeeNeural', label: '🇹🇭 ภาษาไทย - Premwadee' },
};
exports.engine = new EdgeTtsEngine_1.EdgeTtsEngine();
const orchestrator = new TtsOrchestrator_1.TtsOrchestrator(exports.engine);
const generateAudioSegment = async (text, voiceName, outputPath, _entry, timeoutMs = 30000) => {
    return exports.engine.synthesizeToFile(text, voiceName, outputPath, timeoutMs);
};
exports.generateAudioSegment = generateAudioSegment;
function categorizeError(error) {
    return (0, TtsErrorClassifier_1.categorizeTtsError)(error);
}
exports._internal = {
    generateAudioSegment: exports.generateAudioSegment,
};
const selectRandomEntries = (entries, count) => {
    return VoicePreviewService_1.VoicePreviewService.selectRandomEntries(entries, count);
};
exports.selectRandomEntries = selectRandomEntries;
const generateVoicePreview = async (entries, voiceId, projectDir, sampleCount = 3) => {
    const service = new VoicePreviewService_1.VoicePreviewService(exports.engine, projectDir);
    return service.generatePreview(entries, voiceId, sampleCount);
};
exports.generateVoicePreview = generateVoicePreview;
const cleanupOldPreviews = (projectDir) => {
    if (projectDir) {
        const service = new VoicePreviewService_1.VoicePreviewService(exports.engine, projectDir);
        service.cleanupOldPreviews();
    }
};
exports.cleanupOldPreviews = cleanupOldPreviews;
const generateAllAudio = async (entries, langCode, outputDir, onProgress, concurrency = 1, voiceId, signal) => {
    if (signal?.aborted)
        return [];
    const outManager = new TtsOutputManager_1.TtsOutputManager(path_1.default.dirname(outputDir));
    outManager.ensureExists();
    const voiceName = voiceId || exports.VOICE_MAP[langCode]?.voice;
    if (!voiceName) {
        onProgress({ status: 'error', progress: 0, detail: `Không hỗ trợ ngôn ngữ: ${langCode}` });
        return [];
    }
    return orchestrator.generateBatch(entries, voiceName, (index) => outManager.segmentPath(index), concurrency, signal, onProgress);
};
exports.generateAllAudio = generateAllAudio;
//# sourceMappingURL=PiperService.js.map