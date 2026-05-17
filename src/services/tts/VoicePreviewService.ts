import path from 'path';
import fs from 'fs';
import type { EdgeTtsEngine } from './EdgeTtsEngine';
import type { SrtEntry } from './SrtRepository';

export interface PreviewSample {
  index: number;
  text: string;
  audioPath?: string;
}

export interface PreviewResult {
  voiceId: string;
  samples: PreviewSample[];
}

interface CacheEntry extends PreviewResult {
  cachedAt: number;
}

const PREVIEW_SUBDIR = '.auto-voice-over/previews';

export class VoicePreviewService {
  private engine: EdgeTtsEngine;
  private projectPath: string;

  constructor(engine: EdgeTtsEngine, projectPath: string) {
    this.engine = engine;
    this.projectPath = projectPath;
  }

  get previewsDir(): string {
    return path.join(this.projectPath, PREVIEW_SUBDIR);
  }

  static selectRandomEntries(entries: SrtEntry[], count: number): SrtEntry[] {
    if (entries.length <= 4) {
      return entries.slice();
    }
    const middle = entries.slice(2, entries.length - 2);
    const shuffled = [...middle].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  async generatePreview(
    entries: SrtEntry[],
    voiceId: string,
    sampleCount = 3,
  ): Promise<PreviewResult> {
    const previewsDir = path.join(this.previewsDir, voiceId);
    const cachePath = path.join(previewsDir, 'cache.json');

    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry;
        const age = Date.now() - cached.cachedAt;
        if (age < 24 * 60 * 60 * 1000) {
          return { voiceId: cached.voiceId, samples: cached.samples };
        }
      } catch {
        // cache corrupt, regenerate
      }
    }

    const selected = VoicePreviewService.selectRandomEntries(entries, sampleCount);
    const samples: PreviewSample[] = [];

    if (!fs.existsSync(previewsDir)) {
      fs.mkdirSync(previewsDir, { recursive: true });
    }

    for (const entry of selected) {
      const fileName = `preview_${entry.index}.mp3`;
      const audioPath = path.join(previewsDir, fileName);
      const success = await this.engine.synthesizeToFile(entry.text, voiceId, audioPath);
      samples.push({
        index: entry.index,
        text: entry.text,
        audioPath: success ? audioPath : undefined,
      });
    }

    const cacheEntry: CacheEntry = {
      voiceId,
      samples,
      cachedAt: Date.now(),
    };

    fs.writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));

    return { voiceId, samples };
  }

  cleanupOldPreviews(): void {
    const dir = this.previewsDir;
    if (!fs.existsSync(dir)) return;

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const voiceDirs = fs.readdirSync(dir);
    for (const voiceDir of voiceDirs) {
      const cacheFile = path.join(dir, voiceDir, 'cache.json');
      if (fs.existsSync(cacheFile)) {
        try {
          const stat = fs.statSync(cacheFile);
          if (now - stat.mtimeMs > sevenDays) {
            const voiceDirPath = path.join(dir, voiceDir);
            for (const file of fs.readdirSync(voiceDirPath)) {
              fs.unlinkSync(path.join(voiceDirPath, file));
            }
            fs.rmdirSync(voiceDirPath);
          }
        } catch (err) {
          console.warn(`Failed to cleanup preview cache for ${voiceDir}:`, err);
        }
      }
    }
  }
}
