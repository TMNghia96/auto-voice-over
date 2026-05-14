"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const VoicePresets_1 = require("../VoicePresets");
(0, vitest_1.describe)('VoicePresets', () => {
    (0, vitest_1.it)('should have presets for all 11 languages', () => {
        const langs = ['vi', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'en', 'th'];
        langs.forEach(lang => {
            (0, vitest_1.expect)(VoicePresets_1.VOICE_PRESETS[lang]).toBeDefined();
            (0, vitest_1.expect)(VoicePresets_1.VOICE_PRESETS[lang].length).toBeGreaterThanOrEqual(3);
        });
    });
    (0, vitest_1.it)('should have all voices for all languages', () => {
        const langs = ['vi', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'en', 'th'];
        langs.forEach(lang => {
            (0, vitest_1.expect)(VoicePresets_1.ALL_VOICES[lang]).toBeDefined();
            (0, vitest_1.expect)(VoicePresets_1.ALL_VOICES[lang].length).toBeGreaterThanOrEqual(5);
        });
    });
    (0, vitest_1.it)('should mark preset voices correctly', () => {
        const viPresets = VoicePresets_1.VOICE_PRESETS['vi'];
        viPresets.forEach(voice => {
            (0, vitest_1.expect)(voice.isPreset).toBe(true);
        });
    });
    (0, vitest_1.it)('should get voice by id', () => {
        const voice = (0, VoicePresets_1.getVoiceById)('vi-VN-NamMinhNeural');
        (0, vitest_1.expect)(voice).toBeDefined();
        (0, vitest_1.expect)(voice?.name).toBe('NamMinh');
        (0, vitest_1.expect)(voice?.language).toBe('vi');
    });
    (0, vitest_1.it)('should get presets for language', () => {
        const presets = (0, VoicePresets_1.getPresetsForLanguage)('vi');
        (0, vitest_1.expect)(presets.length).toBeGreaterThanOrEqual(3);
        (0, vitest_1.expect)(presets.every(v => v.isPreset)).toBe(true);
    });
    (0, vitest_1.it)('should get all voices for language', () => {
        const allVoices = (0, VoicePresets_1.getAllVoicesForLanguage)('vi');
        (0, vitest_1.expect)(allVoices.length).toBe(5);
        (0, vitest_1.expect)(allVoices.filter(v => v.isPreset)).toHaveLength(3);
        (0, vitest_1.expect)(allVoices.filter(v => !v.isPreset)).toHaveLength(2);
    });
});
//# sourceMappingURL=VoicePresets.test.js.map