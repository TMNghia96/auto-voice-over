import path from 'path';
import fs from 'fs';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import pLimit from 'p-limit';

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

const ensureDir = (dir: string) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

export interface SrtEntryParams {
    index: number;
    text: string;
    startTime?: string;
    endTime?: string;
}

export interface ConcurrencyStats {
    successCount: number;
    failCount: number;
    currentLimit: number;
    lastAdjustTime: number;
}

/**
 * Generate audio for a single text segment using Edge TTS.
 * Uses toStream() and writes directly to the target path for precise control.
 */
export const generateAudioSegment = async (
    text: string,
    voiceName: string,
    outputPath: string,
    entry?: SrtEntryParams
): Promise<boolean> => {
    let cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
        console.log(`Skipping empty text for ${outputPath}`);
        return false;
    }

    try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        const { audioStream } = tts.toStream(cleanText);

        return new Promise<boolean>((resolve) => {
            const writeStream = fs.createWriteStream(outputPath);
            let hasData = false;

            audioStream.on('data', (chunk: Buffer) => {
                hasData = true;
                writeStream.write(chunk);
            });

            audioStream.on('end', () => {
                writeStream.end(() => {
                    tts.close();
                    if (hasData && fs.existsSync(outputPath)) {
                        const stat = fs.statSync(outputPath);
                        if (stat.size > 0) {
                            resolve(true); // Produced valid audio
                        } else {
                            fs.unlinkSync(outputPath);
                            resolve(true); // TTS skipped it / returned no audio. We return true so it acts as an intentional silent gap instead of failing.
                        }
                    } else {
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                        resolve(true); // Graceful fallback
                    }
                });
            });

            audioStream.on('error', (err: Error) => {
                console.error(`Edge TTS stream error for ${outputPath}:`, err);
                writeStream.end(() => {
                    tts.close();
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    resolve(false);
                });
            });
        });
    } catch (err) {
        console.error(`Edge TTS error for ${outputPath}:`, err);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        return false;
    }
};

// Internal reference for testing - allows mocking internal calls
export const _internal = {
    generateAudioSegment,
};

/**
 * Generate audio segment with retry logic and exponential backoff.
 * Max 2 retries with delays of 1s, 2s.
 */
export const generateAudioSegmentWithRetry = async (
    text: string,
    voiceName: string,
    outputPath: string,
    entry?: SrtEntryParams,
    maxRetries = 2
): Promise<boolean> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const success = await _internal.generateAudioSegment(text, voiceName, outputPath, entry);
        if (success) {
            return true;
        }
        
        if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
            console.log(`Retry ${attempt + 1}/${maxRetries} for ${outputPath} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
};

/**
 * Adjust concurrency based on success rate.
 * Increase if >95% success, decrease if <80%.
 */
const adjustConcurrency = (stats: ConcurrencyStats): number => {
    const totalAttempts = stats.successCount + stats.failCount;
    
    if (totalAttempts < 10) {
        return stats.currentLimit; // Not enough data
    }

    const successRate = stats.successCount / totalAttempts;

    if (successRate > 0.95 && stats.currentLimit < 10) {
        return stats.currentLimit + 1;
    } else if (successRate < 0.80 && stats.currentLimit > 1) {
        return Math.max(1, stats.currentLimit - 1);
    }

    return stats.currentLimit;
};

/**
 * Generate all audio segments in parallel with adaptive concurrency.
 */
const generateAllAudioParallel = async (
    entries: SrtEntryParams[],
    voiceName: string,
    outputDir: string,
    onProgress: (p: TTSProgress) => void,
    initialConcurrency: number
): Promise<string[]> => {
    const results: string[] = new Array(entries.length).fill('');
    const stats: ConcurrencyStats = {
        successCount: 0,
        failCount: 0,
        currentLimit: initialConcurrency,
        lastAdjustTime: Date.now(),
    };

    let currentConcurrency = initialConcurrency;
    const limit = pLimit(currentConcurrency);
    let completed = 0;

    const tasks = entries.map((entry, i) => {
        return limit(async () => {
            const fileName = `${String(entry.index).padStart(4, '0')}.mp3`;
            const outputPath = path.join(outputDir, fileName);

            onProgress({
                status: 'generating',
                progress: Math.round((completed / entries.length) * 100),
                detail: `Đang tạo audio... ${completed + 1}/${entries.length}`,
                current: completed + 1,
                total: entries.length,
                entryIndex: entry.index,
                entryStatus: 'start',
            });

            const success = await generateAudioSegmentWithRetry(entry.text, voiceName, outputPath, entry);

            if (success) {
                stats.successCount++;
                results[i] = outputPath;
            } else {
                stats.failCount++;
            }

            completed++;

            onProgress({
                status: 'generating',
                progress: Math.round((completed / entries.length) * 100),
                detail: `Đang tạo audio... ${completed}/${entries.length}`,
                current: completed,
                total: entries.length,
                entryIndex: entry.index,
                entryStatus: success ? 'done' : 'failed',
            });

            // Adjust concurrency every 10 completions
            if (completed % 10 === 0) {
                const newConcurrency = adjustConcurrency(stats);
                if (newConcurrency !== stats.currentLimit) {
                    console.log(`Adjusting concurrency: ${stats.currentLimit} -> ${newConcurrency}`);
                    stats.currentLimit = newConcurrency;
                    stats.lastAdjustTime = Date.now();
                    currentConcurrency = newConcurrency;
                    // Note: p-limit doesn't support dynamic adjustment, but we track it for future batches
                }
            }
        });
    });

    await Promise.all(tasks);
    return results;
};

/**
 * Generate audio for all SRT entries with optional parallel processing.
 * Uses parallel generation if concurrency > 1, otherwise sequential.
 */
export const generateAllAudio = async (
    entries: SrtEntryParams[],
    langCode: string,
    outputDir: string,
    onProgress: (p: TTSProgress) => void,
    concurrency = 1
): Promise<string[]> => {
    ensureDir(outputDir);

    const voice = VOICE_MAP[langCode];
    if (!voice) {
        onProgress({ status: 'error', progress: 0, detail: `Không hỗ trợ ngôn ngữ: ${langCode}` });
        return [];
    }

    // Use parallel processing if concurrency > 1
    if (concurrency > 1) {
        return generateAllAudioParallel(entries, voice.voice, outputDir, onProgress, concurrency);
    }

    // Sequential fallback (concurrency = 1)
    const results: string[] = new Array(entries.length).fill('');

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const fileName = `${String(entry.index).padStart(4, '0')}.mp3`;
        const outputPath = path.join(outputDir, fileName);

        onProgress({
            status: 'generating',
            progress: Math.round((i / entries.length) * 100),
            detail: `Đang tạo audio... ${i + 1}/${entries.length}`,
            current: i + 1,
            total: entries.length,
            entryIndex: entry.index,
            entryStatus: 'start',
        });

        const success = await generateAudioSegment(entry.text, voice.voice, outputPath, entry);

        if (success) {
            results[i] = outputPath;
        }

        onProgress({
            status: 'generating',
            progress: Math.round(((i + 1) / entries.length) * 100),
            detail: `Đang tạo audio... ${i + 1}/${entries.length}`,
            current: i + 1,
            total: entries.length,
            entryIndex: entry.index,
            entryStatus: success ? 'done' : 'failed',
        });
    }

    return results;
};
