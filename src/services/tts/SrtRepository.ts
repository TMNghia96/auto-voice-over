import fs from 'fs';
import path from 'path';

export interface SrtEntry {
  index: number;
  text: string;
  startTime?: string;
  endTime?: string;
}

export class SrtRepository {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  get translateDir(): string {
    return path.join(this.projectPath, 'translate');
  }

  srtPath(lang: string): string {
    return path.join(this.translateDir, `${lang}.srt`);
  }

  exists(lang: string): boolean {
    return fs.existsSync(this.srtPath(lang));
  }

  load(lang: string): string | null {
    const filePath = this.srtPath(lang);
    if (!fs.existsSync(filePath)) return null;
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`Failed to load SRT for ${lang}:`, err);
      return null;
    }
  }

  save(lang: string, content: string): string {
    if (!fs.existsSync(this.translateDir)) {
      fs.mkdirSync(this.translateDir, { recursive: true });
    }
    const filePath = this.srtPath(lang);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  findAvailableLanguage(langs: string[]): { lang: string; content: string } | null {
    for (const lang of langs) {
      const content = this.load(lang);
      if (content) return { lang, content };
    }
    return null;
  }
}