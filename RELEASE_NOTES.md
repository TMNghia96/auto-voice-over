# TTS System Enhancement v2.0.0

## Release Date: 2026-04-30

## Summary
Major enhancement to the TTS system: 3-5x faster generation, voice selection, smart preview, and comprehensive error handling.

## New Features
- **3-5x faster generation** with adaptive parallel processing (p-limit)
- **Voice selection**: Choose from 3-5 preset voices per language, with full library modal (search + gender filter)
- **Smart preview**: Hear 3 random samples before generating all audio (24h cache)
- **Voice preference persistence**: Preferences saved per project per language
- **Smart retry**: Auto-retry + batch retry + individual retry with attempt tracking

## Improvements
- 30s timeout on TTS requests
- Error categorization (no internet, rate limited, timeout, disk full)
- Cancellation support during generation
- Enhanced progress tracking with per-entry status
- Batch retry for failed entries
- Adaptive concurrency (3-15 workers)

## Breaking Changes
None. Fully backward compatible with existing projects.

## Files Changed
- New: src/services/VoicePresets.ts, ProjectConfig.ts
- New: src/components/common/VoiceSelector.tsx, VoiceModal.tsx
- Modified: src/services/PiperService.ts, src/ipc/audio.ts, src/preload.ts
- Modified: src/components/common/AudioGeneratePhase.tsx

## Performance
- 100 entries: ~25-40s (was ~200s with sequential)
- Concurrency: 5 (adaptive 3-15 based on network)
- Preview: first time ~3s, cached instant

## Dependencies
- Added: none (p-limit was already in package.json)

## Testing
- Unit tests: VoicePresets (6), PiperService parallel (2), Preview (2)
- Integration tests: Full workflow (3)
- Performance benchmarks: Speedup verified >=4x
- Manual testing checklist included