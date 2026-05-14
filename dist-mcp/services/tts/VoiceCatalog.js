"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VOICE_MAP = exports.ALL_VOICES = exports.VOICE_PRESETS = void 0;
exports.getVoiceById = getVoiceById;
exports.getPresetsForLanguage = getPresetsForLanguage;
exports.getAllVoicesForLanguage = getAllVoicesForLanguage;
exports.resolveDefaultVoice = resolveDefaultVoice;
exports.resolveVoiceName = resolveVoiceName;
exports.isLanguageSupported = isLanguageSupported;
exports.getSupportedLanguages = getSupportedLanguages;
exports.buildVoiceCatalogWithDynamicVoices = buildVoiceCatalogWithDynamicVoices;
// ============================================================
// Voice data
// ============================================================
const VI_PRESETS = [
    { id: 'vi-VN-NamMinhNeural', name: 'NamMinh', gender: 'Male', language: 'vi', label: 'NamMinh', isPreset: true },
    { id: 'vi-VN-HoaiMyNeural', name: 'HoaiMy', gender: 'Female', language: 'vi', label: 'HoaiMy', isPreset: true },
    { id: 'vi-VN-HoangLongNeural', name: 'HoangLong', gender: 'Male', language: 'vi', label: 'HoangLong', isPreset: true },
];
const VI_ALL = [
    ...VI_PRESETS,
    { id: 'vi-VN-ThanhTamNeural', name: 'ThanhTam', gender: 'Female', language: 'vi', label: 'ThanhTam', isPreset: false },
    { id: 'vi-VN-DuyHungNeural', name: 'DuyHung', gender: 'Male', language: 'vi', label: 'DuyHung', isPreset: false },
];
const ZH_PRESETS = [
    { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', gender: 'Female', language: 'zh', label: 'Xiaoxiao', isPreset: true },
    { id: 'zh-CN-YunxiNeural', name: 'Yunxi', gender: 'Male', language: 'zh', label: 'Yunxi', isPreset: true },
    { id: 'zh-CN-XiaoyiNeural', name: 'Xiaoyi', gender: 'Female', language: 'zh', label: 'Xiaoyi', isPreset: true },
];
const ZH_ALL = [
    ...ZH_PRESETS,
    { id: 'zh-CN-YunjianNeural', name: 'Yunjian', gender: 'Male', language: 'zh', label: 'Yunjian', isPreset: false },
    { id: 'zh-CN-XiaochenNeural', name: 'Xiaochen', gender: 'Female', language: 'zh', label: 'Xiaochen', isPreset: false },
];
const JA_PRESETS = [
    { id: 'ja-JP-NanamiNeural', name: 'Nanami', gender: 'Female', language: 'ja', label: 'Nanami', isPreset: true },
    { id: 'ja-JP-KeitaNeural', name: 'Keita', gender: 'Male', language: 'ja', label: 'Keita', isPreset: true },
    { id: 'ja-JP-AoiNeural', name: 'Aoi', gender: 'Female', language: 'ja', label: 'Aoi', isPreset: true },
];
const JA_ALL = [
    ...JA_PRESETS,
    { id: 'ja-JP-DaichiNeural', name: 'Daichi', gender: 'Male', language: 'ja', label: 'Daichi', isPreset: false },
    { id: 'ja-JP-MayuNeural', name: 'Mayu', gender: 'Female', language: 'ja', label: 'Mayu', isPreset: false },
];
const KO_PRESETS = [
    { id: 'ko-KR-SunHiNeural', name: 'SunHi', gender: 'Female', language: 'ko', label: 'SunHi', isPreset: true },
    { id: 'ko-KR-InJoonNeural', name: 'InJoon', gender: 'Male', language: 'ko', label: 'InJoon', isPreset: true },
    { id: 'ko-KR-JiMinNeural', name: 'JiMin', gender: 'Female', language: 'ko', label: 'JiMin', isPreset: true },
];
const KO_ALL = [
    ...KO_PRESETS,
    { id: 'ko-KR-BongJinNeural', name: 'BongJin', gender: 'Male', language: 'ko', label: 'BongJin', isPreset: false },
    { id: 'ko-KR-SeoHyeonNeural', name: 'SeoHyeon', gender: 'Female', language: 'ko', label: 'SeoHyeon', isPreset: false },
];
const FR_PRESETS = [
    { id: 'fr-FR-DeniseNeural', name: 'Denise', gender: 'Female', language: 'fr', label: 'Denise', isPreset: true },
    { id: 'fr-FR-HenriNeural', name: 'Henri', gender: 'Male', language: 'fr', label: 'Henri', isPreset: true },
    { id: 'fr-FR-BrigitteNeural', name: 'Brigitte', gender: 'Female', language: 'fr', label: 'Brigitte', isPreset: true },
];
const FR_ALL = [
    ...FR_PRESETS,
    { id: 'fr-FR-AlainNeural', name: 'Alain', gender: 'Male', language: 'fr', label: 'Alain', isPreset: false },
    { id: 'fr-FR-CelesteNeural', name: 'Celeste', gender: 'Female', language: 'fr', label: 'Celeste', isPreset: false },
];
const DE_PRESETS = [
    { id: 'de-DE-KatjaNeural', name: 'Katja', gender: 'Female', language: 'de', label: 'Katja', isPreset: true },
    { id: 'de-DE-ConradNeural', name: 'Conrad', gender: 'Male', language: 'de', label: 'Conrad', isPreset: true },
    { id: 'de-DE-AmalaNeural', name: 'Amala', gender: 'Female', language: 'de', label: 'Amala', isPreset: true },
];
const DE_ALL = [
    ...DE_PRESETS,
    { id: 'de-DE-KillianNeural', name: 'Killian', gender: 'Male', language: 'de', label: 'Killian', isPreset: false },
    { id: 'de-DE-TanjaNeural', name: 'Tanja', gender: 'Female', language: 'de', label: 'Tanja', isPreset: false },
];
const ES_PRESETS = [
    { id: 'es-ES-ElviraNeural', name: 'Elvira', gender: 'Female', language: 'es', label: 'Elvira', isPreset: true },
    { id: 'es-ES-AlvaroNeural', name: 'Alvaro', gender: 'Male', language: 'es', label: 'Alvaro', isPreset: true },
    { id: 'es-ES-AbrilNeural', name: 'Abril', gender: 'Female', language: 'es', label: 'Abril', isPreset: true },
];
const ES_ALL = [
    ...ES_PRESETS,
    { id: 'es-ES-ArnauNeural', name: 'Arnau', gender: 'Male', language: 'es', label: 'Arnau', isPreset: false },
    { id: 'es-ES-DarioNeural', name: 'Dario', gender: 'Male', language: 'es', label: 'Dario', isPreset: false },
];
const PT_PRESETS = [
    { id: 'pt-BR-FranciscaNeural', name: 'Francisca', gender: 'Female', language: 'pt', label: 'Francisca', isPreset: true },
    { id: 'pt-BR-AntonioNeural', name: 'Antonio', gender: 'Male', language: 'pt', label: 'Antonio', isPreset: true },
    { id: 'pt-BR-BrendaNeural', name: 'Brenda', gender: 'Female', language: 'pt', label: 'Brenda', isPreset: true },
];
const PT_ALL = [
    ...PT_PRESETS,
    { id: 'pt-BR-DonatoNeural', name: 'Donato', gender: 'Male', language: 'pt', label: 'Donato', isPreset: false },
    { id: 'pt-BR-ElzaNeural', name: 'Elza', gender: 'Female', language: 'pt', label: 'Elza', isPreset: false },
];
const RU_PRESETS = [
    { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana', gender: 'Female', language: 'ru', label: 'Svetlana', isPreset: true },
    { id: 'ru-RU-DmitryNeural', name: 'Dmitry', gender: 'Male', language: 'ru', label: 'Dmitry', isPreset: true },
    { id: 'ru-RU-DariyaNeural', name: 'Dariya', gender: 'Female', language: 'ru', label: 'Dariya', isPreset: true },
];
const RU_ALL = [
    ...RU_PRESETS,
    { id: 'ru-RU-NicholasNeural', name: 'Nicholas', gender: 'Male', language: 'ru', label: 'Nicholas', isPreset: false },
    { id: 'ru-RU-PollinaNeural', name: 'Pollina', gender: 'Female', language: 'ru', label: 'Pollina', isPreset: false },
];
const EN_PRESETS = [
    { id: 'en-US-JennyNeural', name: 'Jenny', gender: 'Female', language: 'en', label: 'Jenny', isPreset: true },
    { id: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', language: 'en', label: 'Guy', isPreset: true },
    { id: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', language: 'en', label: 'Aria', isPreset: true },
];
const EN_ALL = [
    ...EN_PRESETS,
    { id: 'en-US-DavisNeural', name: 'Davis', gender: 'Male', language: 'en', label: 'Davis', isPreset: false },
    { id: 'en-US-JaneNeural', name: 'Jane', gender: 'Female', language: 'en', label: 'Jane', isPreset: false },
];
const TH_PRESETS = [
    { id: 'th-TH-PremwadeeNeural', name: 'Premwadee', gender: 'Female', language: 'th', label: 'Premwadee', isPreset: true },
    { id: 'th-TH-NiwatNeural', name: 'Niwat', gender: 'Male', language: 'th', label: 'Niwat', isPreset: true },
    { id: 'th-TH-AcharaNeural', name: 'Achara', gender: 'Female', language: 'th', label: 'Achara', isPreset: true },
];
const TH_ALL = [
    ...TH_PRESETS,
    { id: 'th-TH-SomchaiNeural', name: 'Somchai', gender: 'Male', language: 'th', label: 'Somchai', isPreset: false },
    { id: 'th-TH-KanyaNeural', name: 'Kanya', gender: 'Female', language: 'th', label: 'Kanya', isPreset: false },
];
// ============================================================
// Public data
// ============================================================
exports.VOICE_PRESETS = {
    vi: VI_PRESETS, zh: ZH_PRESETS, ja: JA_PRESETS, ko: KO_PRESETS,
    fr: FR_PRESETS, de: DE_PRESETS, es: ES_PRESETS, pt: PT_PRESETS,
    ru: RU_PRESETS, en: EN_PRESETS, th: TH_PRESETS,
};
exports.ALL_VOICES = {
    vi: VI_ALL, zh: ZH_ALL, ja: JA_ALL, ko: KO_ALL,
    fr: FR_ALL, de: DE_ALL, es: ES_ALL, pt: PT_ALL,
    ru: RU_ALL, en: EN_ALL, th: TH_ALL,
};
/** Default voice ID per language (backward-compatible with VOICE_MAP) */
exports.DEFAULT_VOICE_MAP = {
    vi: 'vi-VN-NamMinhNeural',
    zh: 'zh-CN-XiaoxiaoNeural',
    ja: 'ja-JP-NanamiNeural',
    ko: 'ko-KR-SunHiNeural',
    fr: 'fr-FR-DeniseNeural',
    de: 'de-DE-KatjaNeural',
    es: 'es-ES-ElviraNeural',
    pt: 'pt-BR-FranciscaNeural',
    ru: 'ru-RU-SvetlanaNeural',
    en: 'en-US-JennyNeural',
    th: 'th-TH-PremwadeeNeural',
};
// ============================================================
// Helper functions
// ============================================================
function getVoiceById(voiceId) {
    for (const voices of Object.values(exports.ALL_VOICES)) {
        const voice = voices.find(v => v.id === voiceId);
        if (voice)
            return voice;
    }
    return undefined;
}
function getPresetsForLanguage(lang) {
    return exports.VOICE_PRESETS[lang] || [];
}
function getAllVoicesForLanguage(lang) {
    return exports.ALL_VOICES[lang] || [];
}
function resolveDefaultVoice(langCode) {
    return exports.DEFAULT_VOICE_MAP[langCode];
}
function resolveVoiceName(langCode, voiceId) {
    return voiceId || exports.DEFAULT_VOICE_MAP[langCode];
}
function isLanguageSupported(langCode) {
    return langCode in exports.DEFAULT_VOICE_MAP;
}
function getSupportedLanguages() {
    return Object.keys(exports.DEFAULT_VOICE_MAP);
}
function buildVoiceCatalogWithDynamicVoices(dynamicVoices) {
    const allVoices = { ...exports.ALL_VOICES };
    const grouped = {};
    for (const voice of dynamicVoices) {
        if (!grouped[voice.language])
            grouped[voice.language] = [];
        grouped[voice.language].push(voice);
    }
    for (const lang of Object.keys(grouped)) {
        allVoices[lang] = Array.from(new Map(grouped[lang].map((v) => [v.id, v])).values())
            .sort((a, b) => a.label.localeCompare(b.label));
    }
    return {
        presets: exports.VOICE_PRESETS,
        allVoices,
    };
}
//# sourceMappingURL=VoiceCatalog.js.map