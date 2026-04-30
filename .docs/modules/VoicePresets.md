# Module: VoicePresets

## Overview
Provides voice definitions and helper functions for the TTS system. Supports 11 languages with 3 preset voices + 2 additional voices per language (5 total).

## Supported Languages
vi (Tiếng Việt), zh (中文), ja (日本語), ko (한국어), fr (Français), de (Deutsch), es (Español), pt (Português), ru (Русский), en (English), th (ภาษาไทย)

## VoiceOption Interface
```typescript
interface VoiceOption {
  id: string;        // Edge TTS voice ID (e.g. "vi-VN-NamMinhNeural")
  name: string;      // Display name (e.g. "NamMinh")
  gender: 'Male' | 'Female' | 'Neutral';
  language: string;  // Language code (e.g. "vi")
  label: string;     // Short label for UI
  isPreset: boolean; // Whether this is a preset voice (shown by default)
}
```

## Exports

### VOICE_PRESETS
`Record<string, VoiceOption[]>` — 3 preset voices per language (shown in VoiceSelector).

### ALL_VOICES
`Record<string, VoiceOption[]>` — 5 voices per language (3 presets + 2 additional, shown in VoiceModal).

## Helper Functions

### getVoiceById(voiceId: string): VoiceOption | undefined
Look up a voice by its Edge TTS ID across all languages.

### getPresetsForLanguage(lang: string): VoiceOption[]
Get only the preset (default) voices for a given language code.

### getAllVoicesForLanguage(lang: string): VoiceOption[]
Get all available voices (presets + additional) for a given language code.

## Usage
- VoiceSelector: displays `VOICE_PRESETS[lang]` as quick-select options
- VoiceModal: displays `ALL_VOICES[lang]` with search and gender filter
- Voice preference persistence: saves voice ID to ProjectConfig as `voicePreference.{lang}`