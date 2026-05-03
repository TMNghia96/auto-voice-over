import path from 'path';
import { EdgeTtsEngine } from './tts/EdgeTtsEngine';
import { TtsOrchestrator } from './tts/TtsOrchestrator';
import { VoicePreviewService } from './tts/VoicePreviewService';
import { TtsOutputManager } from './tts/TtsOutputManager';
import { SrtRepository } from './tts/SrtRepository';
import { categorizeTtsError } from './tts/TtsErrorClassifier';
import { VOICE_PRESETS, ALL_VOICES, DEFAULT_VOICE_MAP, getVoiceById, getPresetsForLanguage, getAllVoicesForLanguage } from './tts/VoiceCatalog';

export interface VoiceConfig {
    voice: string;
    label: string;
}

export const VOICE_MAP: Record<string, VoiceConfig> = {
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

export interface TTSProgress {
    status: 'generating' | 'done' | 'error';
    progress: number;
    detail: string;
    current?: number;
    total?: number;
    entryIndex?: number;
    entryStatus?: 'start' | 'done' | 'failed';
}

export interface SrtEntryParams {
    index: number;
    text: string;
    startTime?: string;
    endTime?: string;
}

export interface PreviewSample {
  index: number;
  text: string;
  audioPath?: string;
}

export interface PreviewResult {
  voiceId: string;
  samples: PreviewSample[];
}

export const engine = new EdgeTtsEngine();
const orchestrator = new TtsOrchestrator(engine);

export const generateAudioSegment = async (
    text: string,
    voiceName: string,
    outputPath: string,
    _entry?: SrtEntryParams,
    timeoutMs: number = 30000
): Promise<boolean> => {
    return engine.synthesizeToFile(text, voiceName, outputPath, timeoutMs);
};

export function categorizeError(error: unknown): string {
  return categorizeTtsError(error);
}

export const _internal = {
    generateAudioSegment,
};

export const selectRandomEntries = (entries: SrtEntryParams[], count: number): SrtEntryParams[] => {
  return VoicePreviewService.selectRandomEntries(entries, count);
};

export const generateVoicePreview = async (
  entries: SrtEntryParams[],
  voiceId: string,
  projectDir: string,
  sampleCount = 3
): Promise<PreviewResult> => {
  const service = new VoicePreviewService(engine, projectDir);
  return service.generatePreview(entries, voiceId, sampleCount);
};

export const cleanupOldPreviews = (projectDir?: string): void => {
  if (projectDir) {
    const service = new VoicePreviewService(engine, projectDir);
    service.cleanupOldPreviews();
  }
};

export const generateAllAudio = async (
    entries: SrtEntryParams[],
    langCode: string,
    outputDir: string,
    onProgress: (p: TTSProgress) => void,
    concurrency = 1,
    voiceId?: string,
    signal?: AbortSignal
): Promise<string[]> => {
    if (signal?.aborted) return [];

    const outManager = new TtsOutputManager(path.dirname(outputDir));
    outManager.ensureExists();

    const voiceName = voiceId || VOICE_MAP[langCode]?.voice;
    if (!voiceName) {
        onProgress({ status: 'error', progress: 0, detail: `Không hỗ trợ ngôn ngữ: ${langCode}` });
        return [];
    }

    return orchestrator.generateBatch(
        entries,
        voiceName,
        (index: number) => outManager.segmentPath(index),
        concurrency,
        signal,
        onProgress,
    );
};

export { VOICE_PRESETS, ALL_VOICES, getVoiceById, getPresetsForLanguage, getAllVoicesForLanguage };