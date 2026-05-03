import fs from 'fs';
import path from 'path';

export interface GeneratedSegment {
  name: string;
  path: string;
}

export class TtsOutputManager {
  private outputDir: string;

  constructor(projectPath: string) {
    this.outputDir = path.join(projectPath, 'audio_gene');
  }

  get dir(): string {
    return this.outputDir;
  }

  ensureExists(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /** Remove old mp3/wav files before a fresh generation */
  clearSegments(): void {
    if (!fs.existsSync(this.outputDir)) return;
    const oldFiles = fs.readdirSync(this.outputDir)
      .filter((f) => f.endsWith('.mp3') || f.endsWith('.wav'));
    for (const f of oldFiles) {
      try {
        fs.unlinkSync(path.join(this.outputDir, f));
      } catch (err) {
        console.warn(`Failed to delete old file ${f}:`, err);
      }
    }
  }

  segmentPath(index: number): string {
    const fileName = `${String(index).padStart(4, '0')}.mp3`;
    return path.join(this.outputDir, fileName);
  }

  listSegments(): GeneratedSegment[] {
    if (!fs.existsSync(this.outputDir)) return [];
    return fs.readdirSync(this.outputDir)
      .filter((f) => f.endsWith('.mp3') || f.endsWith('.wav'))
      .sort()
      .map((f) => ({
        name: f,
        path: path.join(this.outputDir, f),
      }));
  }

  readSegment(filePath: string): string | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
      const base64 = buffer.toString('base64');
      return `data:${mime};base64,${base64}`;
    } catch {
      return null;
    }
  }
}