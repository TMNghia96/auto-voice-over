import fs from 'fs';
import path from 'path';
import { MsEdgeTTS } from 'msedge-tts';
import { getSupportedLanguages, type VoiceOption } from './VoiceCatalog';

interface EdgeVoiceDto {
  Name?: string;
  ShortName?: string;
  Gender?: string;
  Locale?: string;
}

interface CachePayload {
  cachedAt: number;
  voices: VoiceOption[];
}

const CACHE_FILE = path.join(process.cwd(), '.auto-voice-over', 'edge-voices-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeGender(input?: string): 'Male' | 'Female' | 'Neutral' {
  if (input === 'Male' || input === 'Female') return input;
  return 'Neutral';
}

function toVoiceOption(dto: EdgeVoiceDto): VoiceOption | null {
  if (!dto.ShortName || !dto.Locale) return null;
  const language = dto.Locale.split('-')[0]?.toLowerCase();
  if (!language) return null;
  return {
    id: dto.ShortName,
    name: dto.ShortName.replace(/Neural$/i, ''),
    gender: normalizeGender(dto.Gender),
    language,
    label: dto.ShortName,
    isPreset: false,
  };
}

function readCache(): VoiceOption[] | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as CachePayload;
    if (!Array.isArray(parsed.voices) || typeof parsed.cachedAt !== 'number') return null;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.voices;
  } catch {
    return null;
  }
}

function writeCache(voices: VoiceOption[]): void {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ cachedAt: Date.now(), voices }, null, 2));
}

export async function fetchEdgeVoices(): Promise<VoiceOption[]> {
  const cached = readCache();
  if (cached) return cached;

  const tts = new MsEdgeTTS();
  const allVoices = (await tts.getVoices()) as EdgeVoiceDto[];
  const supportedLangs = new Set(getSupportedLanguages());
  const mapped = allVoices
    .map(toVoiceOption)
    .filter((v): v is VoiceOption => !!v)
    .filter((v) => supportedLangs.has(v.language));

  const deduped = Array.from(new Map(mapped.map((v) => [v.id, v])).values())
    .sort((a, b) => a.label.localeCompare(b.label));

  writeCache(deduped);
  return deduped;
}
