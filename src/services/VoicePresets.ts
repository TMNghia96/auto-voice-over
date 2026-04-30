export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female';
  isPreset: boolean;
}

// Vietnamese voices
const VI_PRESETS: VoiceOption[] = [
  { id: 'vi-VN-NamMinhNeural', name: 'NamMinh', language: 'vi', gender: 'male', isPreset: true },
  { id: 'vi-VN-HoaiMyNeural', name: 'HoaiMy', language: 'vi', gender: 'female', isPreset: true },
  { id: 'vi-VN-HoangLongNeural', name: 'HoangLong', language: 'vi', gender: 'male', isPreset: true },
];

const VI_ALL: VoiceOption[] = [
  ...VI_PRESETS,
  { id: 'vi-VN-ThanhTamNeural', name: 'ThanhTam', language: 'vi', gender: 'female', isPreset: false },
  { id: 'vi-VN-DuyHungNeural', name: 'DuyHung', language: 'vi', gender: 'male', isPreset: false },
];

// Chinese voices
const ZH_PRESETS: VoiceOption[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', language: 'zh', gender: 'female', isPreset: true },
  { id: 'zh-CN-YunxiNeural', name: 'Yunxi', language: 'zh', gender: 'male', isPreset: true },
  { id: 'zh-CN-XiaoyiNeural', name: 'Xiaoyi', language: 'zh', gender: 'female', isPreset: true },
];

const ZH_ALL: VoiceOption[] = [
  ...ZH_PRESETS,
  { id: 'zh-CN-YunjianNeural', name: 'Yunjian', language: 'zh', gender: 'male', isPreset: false },
  { id: 'zh-CN-XiaochenNeural', name: 'Xiaochen', language: 'zh', gender: 'female', isPreset: false },
];

// Japanese voices
const JA_PRESETS: VoiceOption[] = [
  { id: 'ja-JP-NanamiNeural', name: 'Nanami', language: 'ja', gender: 'female', isPreset: true },
  { id: 'ja-JP-KeitaNeural', name: 'Keita', language: 'ja', gender: 'male', isPreset: true },
  { id: 'ja-JP-AoiNeural', name: 'Aoi', language: 'ja', gender: 'female', isPreset: true },
];

const JA_ALL: VoiceOption[] = [
  ...JA_PRESETS,
  { id: 'ja-JP-DaichiNeural', name: 'Daichi', language: 'ja', gender: 'male', isPreset: false },
  { id: 'ja-JP-MayuNeural', name: 'Mayu', language: 'ja', gender: 'female', isPreset: false },
];

// Korean voices
const KO_PRESETS: VoiceOption[] = [
  { id: 'ko-KR-SunHiNeural', name: 'SunHi', language: 'ko', gender: 'female', isPreset: true },
  { id: 'ko-KR-InJoonNeural', name: 'InJoon', language: 'ko', gender: 'male', isPreset: true },
  { id: 'ko-KR-JiMinNeural', name: 'JiMin', language: 'ko', gender: 'female', isPreset: true },
];

const KO_ALL: VoiceOption[] = [
  ...KO_PRESETS,
  { id: 'ko-KR-BongJinNeural', name: 'BongJin', language: 'ko', gender: 'male', isPreset: false },
  { id: 'ko-KR-SeoHyeonNeural', name: 'SeoHyeon', language: 'ko', gender: 'female', isPreset: false },
];

// French voices
const FR_PRESETS: VoiceOption[] = [
  { id: 'fr-FR-DeniseNeural', name: 'Denise', language: 'fr', gender: 'female', isPreset: true },
  { id: 'fr-FR-HenriNeural', name: 'Henri', language: 'fr', gender: 'male', isPreset: true },
  { id: 'fr-FR-BrigitteNeural', name: 'Brigitte', language: 'fr', gender: 'female', isPreset: true },
];

const FR_ALL: VoiceOption[] = [
  ...FR_PRESETS,
  { id: 'fr-FR-AlainNeural', name: 'Alain', language: 'fr', gender: 'male', isPreset: false },
  { id: 'fr-FR-CelesteNeural', name: 'Celeste', language: 'fr', gender: 'female', isPreset: false },
];

// German voices
const DE_PRESETS: VoiceOption[] = [
  { id: 'de-DE-KatjaNeural', name: 'Katja', language: 'de', gender: 'female', isPreset: true },
  { id: 'de-DE-ConradNeural', name: 'Conrad', language: 'de', gender: 'male', isPreset: true },
  { id: 'de-DE-AmalaNeural', name: 'Amala', language: 'de', gender: 'female', isPreset: true },
];

const DE_ALL: VoiceOption[] = [
  ...DE_PRESETS,
  { id: 'de-DE-KillianNeural', name: 'Killian', language: 'de', gender: 'male', isPreset: false },
  { id: 'de-DE-TanjaNeural', name: 'Tanja', language: 'de', gender: 'female', isPreset: false },
];

// Spanish voices
const ES_PRESETS: VoiceOption[] = [
  { id: 'es-ES-ElviraNeural', name: 'Elvira', language: 'es', gender: 'female', isPreset: true },
  { id: 'es-ES-AlvaroNeural', name: 'Alvaro', language: 'es', gender: 'male', isPreset: true },
  { id: 'es-ES-AbrilNeural', name: 'Abril', language: 'es', gender: 'female', isPreset: true },
];

const ES_ALL: VoiceOption[] = [
  ...ES_PRESETS,
  { id: 'es-ES-ArnauNeural', name: 'Arnau', language: 'es', gender: 'male', isPreset: false },
  { id: 'es-ES-DarioNeural', name: 'Dario', language: 'es', gender: 'male', isPreset: false },
];

// Portuguese voices
const PT_PRESETS: VoiceOption[] = [
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca', language: 'pt', gender: 'female', isPreset: true },
  { id: 'pt-BR-AntonioNeural', name: 'Antonio', language: 'pt', gender: 'male', isPreset: true },
  { id: 'pt-BR-BrendaNeural', name: 'Brenda', language: 'pt', gender: 'female', isPreset: true },
];

const PT_ALL: VoiceOption[] = [
  ...PT_PRESETS,
  { id: 'pt-BR-DonatoNeural', name: 'Donato', language: 'pt', gender: 'male', isPreset: false },
  { id: 'pt-BR-ElzaNeural', name: 'Elza', language: 'pt', gender: 'female', isPreset: false },
];

// Russian voices
const RU_PRESETS: VoiceOption[] = [
  { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana', language: 'ru', gender: 'female', isPreset: true },
  { id: 'ru-RU-DmitryNeural', name: 'Dmitry', language: 'ru', gender: 'male', isPreset: true },
  { id: 'ru-RU-DariyaNeural', name: 'Dariya', language: 'ru', gender: 'female', isPreset: true },
];

const RU_ALL: VoiceOption[] = [
  ...RU_PRESETS,
  { id: 'ru-RU-NicholasNeural', name: 'Nicholas', language: 'ru', gender: 'male', isPreset: false },
  { id: 'ru-RU-PollinaNeural', name: 'Pollina', language: 'ru', gender: 'female', isPreset: false },
];

// English voices
const EN_PRESETS: VoiceOption[] = [
  { id: 'en-US-JennyNeural', name: 'Jenny', language: 'en', gender: 'female', isPreset: true },
  { id: 'en-US-GuyNeural', name: 'Guy', language: 'en', gender: 'male', isPreset: true },
  { id: 'en-US-AriaNeural', name: 'Aria', language: 'en', gender: 'female', isPreset: true },
];

const EN_ALL: VoiceOption[] = [
  ...EN_PRESETS,
  { id: 'en-US-DavisNeural', name: 'Davis', language: 'en', gender: 'male', isPreset: false },
  { id: 'en-US-JaneNeural', name: 'Jane', language: 'en', gender: 'female', isPreset: false },
];

// Thai voices
const TH_PRESETS: VoiceOption[] = [
  { id: 'th-TH-PremwadeeNeural', name: 'Premwadee', language: 'th', gender: 'female', isPreset: true },
  { id: 'th-TH-NiwatNeural', name: 'Niwat', language: 'th', gender: 'male', isPreset: true },
  { id: 'th-TH-AcharaNeural', name: 'Achara', language: 'th', gender: 'female', isPreset: true },
];

const TH_ALL: VoiceOption[] = [
  ...TH_PRESETS,
  { id: 'th-TH-SomchaiNeural', name: 'Somchai', language: 'th', gender: 'male', isPreset: false },
  { id: 'th-TH-KanyaNeural', name: 'Kanya', language: 'th', gender: 'female', isPreset: false },
];

// Export preset voices by language
export const VOICE_PRESETS: Record<string, VoiceOption[]> = {
  vi: VI_PRESETS,
  zh: ZH_PRESETS,
  ja: JA_PRESETS,
  ko: KO_PRESETS,
  fr: FR_PRESETS,
  de: DE_PRESETS,
  es: ES_PRESETS,
  pt: PT_PRESETS,
  ru: RU_PRESETS,
  en: EN_PRESETS,
  th: TH_PRESETS,
};

// Export all voices by language
export const ALL_VOICES: Record<string, VoiceOption[]> = {
  vi: VI_ALL,
  zh: ZH_ALL,
  ja: JA_ALL,
  ko: KO_ALL,
  fr: FR_ALL,
  de: DE_ALL,
  es: ES_ALL,
  pt: PT_ALL,
  ru: RU_ALL,
  en: EN_ALL,
  th: TH_ALL,
};

// Helper functions
export const getVoiceById = (voiceId: string): VoiceOption | undefined => {
  for (const voices of Object.values(ALL_VOICES)) {
    const voice = voices.find(v => v.id === voiceId);
    if (voice) return voice;
  }
  return undefined;
};

export const getPresetsForLanguage = (lang: string): VoiceOption[] => {
  return VOICE_PRESETS[lang] || [];
};

export const getAllVoicesForLanguage = (lang: string): VoiceOption[] => {
  return ALL_VOICES[lang] || [];
};
