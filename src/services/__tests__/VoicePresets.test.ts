import { describe, it, expect } from 'vitest';
import { VOICE_PRESETS, ALL_VOICES, getVoiceById, getPresetsForLanguage } from '../VoicePresets';

describe('VoicePresets', () => {
  it('should have presets for all 11 languages', () => {
    const langs = ['vi', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'en', 'th'];
    langs.forEach(lang => {
      expect(VOICE_PRESETS[lang]).toBeDefined();
      expect(VOICE_PRESETS[lang].length).toBeGreaterThanOrEqual(3);
    });
  });

  it('should have all voices for all languages', () => {
    const langs = ['vi', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'en', 'th'];
    langs.forEach(lang => {
      expect(ALL_VOICES[lang]).toBeDefined();
      expect(ALL_VOICES[lang].length).toBeGreaterThanOrEqual(5);
    });
  });

  it('should mark preset voices correctly', () => {
    const viPresets = VOICE_PRESETS['vi'];
    viPresets.forEach(voice => {
      expect(voice.isPreset).toBe(true);
    });
  });

  it('should get voice by id', () => {
    const voice = getVoiceById('vi-VN-NamMinhNeural');
    expect(voice).toBeDefined();
    expect(voice?.name).toBe('NamMinh');
    expect(voice?.language).toBe('vi');
  });

  it('should get presets for language', () => {
    const presets = getPresetsForLanguage('vi');
    expect(presets.length).toBeGreaterThanOrEqual(3);
    expect(presets.every(v => v.isPreset)).toBe(true);
  });
});
