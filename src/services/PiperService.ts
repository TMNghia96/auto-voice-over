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

export interface PreviewSample {
  index: number;
  text: string;
  audioPath?: string;
}

export interface PreviewResult {
  voiceId: string;
  samples: PreviewSample[];
}

const PREVIEW_CACHE_DIR = '.auto-voice-over/previews';

const getPreviewCachePath = (voiceId: string): string => {
  return path.join(PREVIEW_CACHE_DIR, voiceId, 'cache.json');
};

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
    entry?: SrtEntryParams,
    timeoutMs: number = 30000
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
            let finalized = false;

            const done = (success: boolean) => {
                if (finalized) return;
                finalized = true;
                clearTimeout(timer);
                resolve(success);
            };

            const timer = setTimeout(() => {
                console.error(`Timeout ${timeoutMs}ms for ${outputPath}`);
                audioStream.destroy();
                writeStream.end(() => {
                    tts.close();
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    done(false);
                });
            }, timeoutMs);

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
                            done(true);
                        } else {
                            fs.unlinkSync(outputPath);
                            done(true);
                        }
                    } else {
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                        done(true);
                    }
                });
            });

            audioStream.on('error', (err: Error) => {
                console.error(`Edge TTS stream error for ${outputPath}:`, err);
                writeStream.end(() => {
                    tts.close();
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    done(false);
                });
            });
        });
    } catch (err) {
        console.error(`Edge TTS error for ${outputPath}:`, err);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        return false;
    }
};

export function categorizeError(error: any): string {
  const message = error?.message || String(error);
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) return 'Network timeout';
  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) return 'No internet connection';
  if (message.includes('429') || message.includes('rate limit')) return 'Rate limited';
  if (message.includes('ENOSPC')) return 'Disk space full';
  if (message.includes('EACCES') || message.includes('EPERM')) return 'Permission denied';
  return 'Unknown error';
}

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
): Promise<{ success: boolean; error?: string }> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const success = await _internal.generateAudioSegment(text, voiceName, outputPath, entry);
            if (success) {
                return { success: true };
            }
        } catch (err) {
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`Retry ${attempt + 1}/${maxRetries} for ${outputPath} after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            return { success: false, error: categorizeError(err) };
        }
        
        if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`Retry ${attempt + 1}/${maxRetries} for ${outputPath} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return { success: false };
};

/**
 * Adjust concurrency based on success rate.
 * Increase if >95% success, decrease if <80%.
 */
const adjustConcurrency = (stats: ConcurrencyStats): number => {
    const totalAttempts = stats.successCount + stats.failCount;
    
    if (totalAttempts <= 10) {
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
 * Pick `count` random entries from the middle of the list,
 * avoiding the first 2 and last 2 entries.
 */
export const selectRandomEntries = (entries: SrtEntryParams[], count: number): SrtEntryParams[] => {
  if (entries.length <= 4) {
    return entries.slice();
  }
  const middle = entries.slice(2, entries.length - 2);
  const shuffled = [...middle].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
};

/**
 * Generate a voice preview: pick random entries and return them as samples.
 * Caches the result in `.auto-voice-over/previews/{voiceId}/cache.json` (24h TTL).
 */
export const generateVoicePreview = async (
  entries: SrtEntryParams[],
  voiceId: string,
  projectDir: string,
  sampleCount = 3
): Promise<PreviewResult> => {
  const previewsDir = path.join(projectDir, PREVIEW_CACHE_DIR, voiceId);
  const cachePath = path.join(previewsDir, 'cache.json');

  // Check cache
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as PreviewResult & { cachedAt: number };
    const age = Date.now() - cached.cachedAt;
    if (age < 24 * 60 * 60 * 1000) {
      return { voiceId: cached.voiceId, samples: cached.samples };
    }
  }

  const selected = selectRandomEntries(entries, sampleCount);
  const samples: PreviewSample[] = [];

  for (const entry of selected) {
    const fileName = `preview_${entry.index}.mp3`;
    const audioPath = path.join(previewsDir, fileName);
    const success = await generateAudioSegment(entry.text, voiceId, audioPath, entry);
    samples.push({
      index: entry.index,
      text: entry.text,
      audioPath: success ? audioPath : undefined,
    });
  }

  const result: PreviewResult & { cachedAt: number } = {
    voiceId,
    samples,
    cachedAt: Date.now(),
  };

  ensureDir(path.dirname(cachePath));
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));

  return { voiceId, samples };
};

/**
 * Remove preview caches older than 7 days.
 */
export const cleanupOldPreviews = (projectDir?: string): void => {
  const previewsDir = projectDir ? path.join(projectDir, PREVIEW_CACHE_DIR) : PREVIEW_CACHE_DIR;
  if (!fs.existsSync(previewsDir)) return;

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const voiceDirs = fs.readdirSync(previewsDir);
  for (const voiceDir of voiceDirs) {
    const cacheFile = path.join(previewsDir, voiceDir, 'cache.json');
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (now - stat.mtimeMs > sevenDays) {
        fs.unlinkSync(cacheFile);
        // Remove empty parent directory
        const parent = path.dirname(cacheFile);
        if (fs.readdirSync(parent).length === 0) {
          fs.rmdirSync(parent);
        }
      }
    }
  }
};

/**
 * Generate all audio segments in parallel with adaptive concurrency.
 */
const generateAllAudioParallel = async (
    entries: SrtEntryParams[],
    voiceName: string,
    outputDir: string,
    onProgress: (p: TTSProgress) => void,
    initialConcurrency: number,
    voiceId?: string,
    signal?: AbortSignal
): Promise<string[]> => {
    if (signal?.aborted) return [];

    const results: string[] = new Array(entries.length).fill('');
    const stats: ConcurrencyStats = {
        successCount: 0,
        failCount: 0,
        currentLimit: initialConcurrency,
        lastAdjustTime: Date.now(),
    };
    const errorCounts: Record<string, number> = {};

    let currentConcurrency = initialConcurrency;
    const limit = pLimit(currentConcurrency);
    let completed = 0;

    const tasks = entries.map((entry, i) => {
        return limit(async () => {
            if (signal?.aborted) return;

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

            const result = await generateAudioSegmentWithRetry(entry.text, voiceName, outputPath, entry);

            if (result.success) {
                stats.successCount++;
                results[i] = outputPath;
            } else {
                stats.failCount++;
            }

            completed++;

            let detail = `Đang tạo audio... ${completed}/${entries.length}`;
            if (!result.success && result.error) {
                const errType = result.error;
                errorCounts[errType] = (errorCounts[errType] || 0) + 1;
                if (errorCounts[errType] > 3 && errType === 'Rate limited' && currentConcurrency > 1) {
                    currentConcurrency = Math.max(1, currentConcurrency - 1);
                    errorCounts[errType] = 0;
                }
                detail = `Lỗi (${errType}) - ${completed}/${entries.length}`;
            }

            onProgress({
                status: 'generating',
                progress: Math.round((completed / entries.length) * 100),
                detail,
                current: completed,
                total: entries.length,
                entryIndex: entry.index,
                entryStatus: result.success ? 'done' : 'failed',
            });

            if (completed % 10 === 0) {
                const newConcurrency = adjustConcurrency(stats);
                if (newConcurrency !== stats.currentLimit) {
                    console.log(`Adjusting concurrency: ${stats.currentLimit} -> ${newConcurrency}`);
                    stats.currentLimit = newConcurrency;
                    stats.lastAdjustTime = Date.now();
                    currentConcurrency = newConcurrency;
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
    concurrency = 1,
    voiceId?: string,
    signal?: AbortSignal
): Promise<string[]> => {
    if (signal?.aborted) return [];

    ensureDir(outputDir);

    const voiceName = voiceId || VOICE_MAP[langCode]?.voice;
    if (!voiceName) {
        onProgress({ status: 'error', progress: 0, detail: `Không hỗ trợ ngôn ngữ: ${langCode}` });
        return [];
    }

    if (concurrency > 1) {
        return generateAllAudioParallel(entries, voiceName, outputDir, onProgress, concurrency, voiceId, signal);
    }

    const results: string[] = new Array(entries.length).fill('');

    for (let i = 0; i < entries.length; i++) {
        if (signal?.aborted) return results;

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

        const result = await generateAudioSegmentWithRetry(entry.text, voiceName, outputPath, entry);

        if (result.success) {
            results[i] = outputPath;
        }

        onProgress({
            status: 'generating',
            progress: Math.round(((i + 1) / entries.length) * 100),
            detail: `Đang tạo audio... ${i + 1}/${entries.length}`,
            current: i + 1,
            total: entries.length,
            entryIndex: entry.index,
            entryStatus: result.success ? 'done' : 'failed',
        });
    }

    return results;
};
