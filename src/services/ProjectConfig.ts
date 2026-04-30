import fs from 'fs';
import path from 'path';

export interface ProjectConfig {
  version: number;
  voicePreferences?: Record<string, string>;
  concurrencySettings?: {
    initial: number;
    min: number;
    max: number;
  };
}

const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  voicePreferences: {},
  concurrencySettings: { initial: 5, min: 3, max: 15 },
};

export function getConfigPath(projectPath: string): string {
  return path.join(projectPath, '.auto-voice-over', 'config.json');
}

export function loadProjectConfig(projectPath: string): ProjectConfig {
  const configPath = getConfigPath(projectPath);
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch (err) {
    console.error('Failed to load project config:', err);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveProjectConfig(projectPath: string, config: ProjectConfig): void {
  const configPath = getConfigPath(projectPath);
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save project config:', err);
  }
}

export function getVoicePreference(projectPath: string, lang: string): string | undefined {
  return loadProjectConfig(projectPath).voicePreferences?.[lang];
}

export function setVoicePreference(projectPath: string, lang: string, voiceId: string): void {
  const config = loadProjectConfig(projectPath);
  if (!config.voicePreferences) config.voicePreferences = {};
  config.voicePreferences[lang] = voiceId;
  saveProjectConfig(projectPath, config);
}