import pLimit from 'p-limit';
import type { EdgeTtsEngine } from './EdgeTtsEngine';
import type { SrtEntry } from './SrtRepository';
import { categorizeTtsError } from './TtsErrorClassifier';
import type { TTSProgress } from './TtsGenerationSession';

interface ConcurrencyStats {
  successCount: number;
  failCount: number;
  currentLimit: number;
}

function adjustConcurrency(stats: ConcurrencyStats): number {
  const total = stats.successCount + stats.failCount;
  if (total <= 10) return stats.currentLimit;

  const successRate = stats.successCount / total;
  if (successRate > 0.95 && stats.currentLimit < 20) {
    return stats.currentLimit + 1;
  } else if (successRate < 0.80 && stats.currentLimit > 1) {
    return Math.max(1, stats.currentLimit - 1);
  }
  return stats.currentLimit;
}

export class TtsOrchestrator {
  private engine: EdgeTtsEngine;
  private defaultConcurrency: number;

  constructor(engine: EdgeTtsEngine, concurrency = 10) {
    this.engine = engine;
    this.defaultConcurrency = concurrency;
  }

  async generateSegment(
    text: string,
    voiceId: string,
    outputPath: string,
    maxRetries = 2,
  ): Promise<{ success: boolean; error?: string }> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const success = await this.engine.synthesizeToFile(text, voiceId, outputPath);
        if (success) return { success: true };
      } catch (err) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Retry ${attempt + 1}/${maxRetries} for ${outputPath} after ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return { success: false, error: categorizeTtsError(err) };
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retry ${attempt + 1}/${maxRetries} for ${outputPath} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return { success: false };
  }

  async generateBatch(
    entries: SrtEntry[],
    voiceId: string,
    getOutputPath: (index: number) => string,
    concurrency?: number,
    signal?: AbortSignal,
    onProgress?: (p: TTSProgress) => void,
  ): Promise<string[]> {
    if (signal?.aborted) return [];

    const results: string[] = new Array(entries.length).fill('');
    const stats: ConcurrencyStats = {
      successCount: 0,
      failCount: 0,
      currentLimit: concurrency ?? this.defaultConcurrency,
    };
    const errorCounts: Record<string, number> = {};

    let currentConcurrency = concurrency ?? this.defaultConcurrency;
    const limit = pLimit(currentConcurrency);
    let completed = 0;

    const tasks = entries.map((entry, i) => {
      return limit(async () => {
        if (signal?.aborted) return;

        const outputPath = getOutputPath(entry.index);

        onProgress?.({
          status: 'generating',
          progress: Math.round((completed / entries.length) * 100),
          detail: `Đang tạo audio... ${completed + 1}/${entries.length}`,
          current: completed + 1,
          total: entries.length,
          entryIndex: entry.index,
          entryStatus: 'start',
        });

        const result = await this.generateSegment(entry.text, voiceId, outputPath);

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
            currentConcurrency = Math.max(3, currentConcurrency - 1);
            errorCounts[errType] = 0;
          }
          detail = `Lỗi (${errType}) - ${completed}/${entries.length}`;
        }

        onProgress?.({
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
            currentConcurrency = newConcurrency;
            (limit as any).concurrency = newConcurrency;
          }
        }
      });
    });

    await Promise.all(tasks);

    for (let round = 0; round < 2; round++) {
      if (signal?.aborted) break;

      const failedIndices: number[] = [];
      entries.forEach((_, i) => {
        if (results[i] === '') failedIndices.push(i);
      });

      if (failedIndices.length === 0) break;

      onProgress?.({
        status: 'generating',
        progress: Math.round((completed / entries.length) * 100),
        detail: `Đang thử lại các đoạn lỗi (lần ${round + 1}/2)...`,
      });

      const retryLimit = pLimit(currentConcurrency);
      const retryTasks = failedIndices.map((i) =>
        retryLimit(async () => {
          const entry = entries[i];
          const outputPath = getOutputPath(entry.index);
          const result = await this.generateSegment(entry.text, voiceId, outputPath);

          if (result.success) {
            results[i] = outputPath;
            stats.successCount++;
          } else {
            stats.failCount++;
          }

          onProgress?.({
            status: 'generating',
            progress: Math.round(((completed + 1) / entries.length) * 100),
            detail: `Đang thử lại... ${completed + 1}/${entries.length}`,
            current: completed + 1,
            total: entries.length,
            entryIndex: entry.index,
            entryStatus: result.success ? 'done' : 'failed',
          });
        }),
      );

      await Promise.all(retryTasks);
    }

    const finalSuccessCount = results.filter((r) => r !== '').length;
    onProgress?.({
      status: 'done',
      progress: 100,
      detail: `Hoàn tất! ${finalSuccessCount}/${entries.length} audio đã được tạo.`,
      current: finalSuccessCount,
      total: entries.length,
    });

    return results;
  }
}