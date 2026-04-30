# TTS System Enhancement Design

**Date:** 2026-04-30  
**Status:** Approved  
**Approach:** Incremental Enhancement (Approach A)

## Executive Summary

Enhance the existing TTS system with three key improvements:
1. **Speed**: 3-5x faster generation via adaptive parallel processing
2. **Voice Selection**: Preset + full voice library with preview
3. **UX**: Smart preview, auto-retry, batch retry, better error handling

**Estimated effort:** 4-5 days  
**Risk level:** Low  
**Backward compatibility:** Full

---

## 1. Current State Analysis

### Problems Identified
- **Sequential processing**: Generates audio one entry at a time (~200s for 100 entries)
- **No voice choice**: Each language locked to 1 voice (hardcoded in VOICE_MAP)
- **No preview**: User can't hear voice before generating all audio
- **Basic retry**: Only manual per-entry retry, no auto-retry or batch operations
- **Outdated docs**: Documentation references Piper TTS but code uses Edge TTS

### Current Architecture
```
User selects language → AudioGeneratePhase
    ↓
IPC: generate-audio
    ↓
PiperService.generateAllAudio() [SEQUENTIAL]
    ↓
Loop: generateAudioSegment() for each entry
    ↓
Edge TTS API → MP3 files in audio_gene/
```

---

## 2. Architecture Overview

### Core Principle
Enhance existing `PiperService.ts` without breaking changes. Add new capabilities while maintaining backward compatibility.

### Components Affected
- `src/services/PiperService.ts` - Core TTS logic
- `src/renderer/components/AudioGeneratePhase.tsx` - Generation UI
- `src/ipc/audio.ts` - IPC handlers
- `package.json` - Add `p-limit` dependency

### New Files
- `src/services/VoicePresets.ts` - Voice configuration data
- `src/renderer/components/VoiceSelector.tsx` - Voice selection UI
- `src/renderer/components/VoiceModal.tsx` - Full voice list modal

### Data Flow
```
User selects language + voice (VoiceSelector)
    ↓
Voice preference saved to project config
    ↓
Click "Preview" → Generate 3 random samples
    ↓
Click "Generate" → IPC with {lang, voiceName}
    ↓
generateAllAudio() with adaptive concurrency
    ↓
p-limit controls parallel requests (start: 5)
    ↓
Monitor success rate → adjust concurrency (3-15)
    ↓
Auto-retry failed entries (max 2 times, exponential backoff)
    ↓
Progress updates → UI shows per-entry status
    ↓
Batch retry available for remaining failures
```

---

## 3. Voice Selection System

### Data Structure

**VoicePresets.ts:**
```typescript
export interface VoiceOption {
    id: string;              // 'vi-VN-NamMinhNeural'
    name: string;            // 'NamMinh'
    gender: 'Male' | 'Female' | 'Neutral';
    language: string;        // 'vi'
    label: string;           // '🇻🇳 Nam Minh (Nam)'
    isPreset: boolean;       // true for top 3-5
}

export const VOICE_PRESETS: Record<string, VoiceOption[]> = {
    vi: [
        { id: 'vi-VN-NamMinhNeural', name: 'NamMinh', gender: 'Male', ... },
        { id: 'vi-VN-HoaiMyNeural', name: 'HoaiMy', gender: 'Female', ... },
        { id: 'vi-VN-NamMaiNeural', name: 'NamMai', gender: 'Female', ... },
    ],
    // ... 10 other languages
};

export const ALL_VOICES: Record<string, VoiceOption[]> = {
    // Full list including non-preset voices (5-10 per language)
};
```

### UI Components

**VoiceSelector.tsx:**
- Dropdown showing 3-5 preset voices
- Preview button (🔊) to hear samples
- "More voices..." button to open modal

**VoiceModal.tsx:**
- Grid layout with voice cards
- Filter by gender (All/Male/Female)
- Search box (filter by name)
- Preview button on each card
- Click card to select and close

### Persistence
- Save to `{projectPath}/.auto-voice-over/config.json`
- Format: `{ voicePreferences: { vi: 'vi-VN-HoaiMyNeural', en: 'en-US-GuyNeural' } }`
- Backward compatible: Falls back to old VOICE_MAP defaults if not set

---

## 4. Parallel Processing with Adaptive Concurrency

### Core Mechanism

**Use p-limit for concurrency control:**
```typescript
import pLimit from 'p-limit';

interface ConcurrencyStats {
    successCount: number;
    failCount: number;
    currentLimit: number;
    lastAdjustTime: number;
}

export const generateAllAudio = async (
    entries: SrtEntryParams[],
    langCode: string,
    outputDir: string,
    onProgress: (p: TTSProgress) => void,
    initialConcurrency = 5
): Promise<string[]> => {
    const stats: ConcurrencyStats = {
        successCount: 0,
        failCount: 0,
        currentLimit: initialConcurrency,
        lastAdjustTime: Date.now()
    };
    
    let limit = pLimit(stats.currentLimit);
    
    const tasks = entries.map((entry, i) => 
        limit(async () => {
            const success = await generateAudioSegmentWithRetry(
                entry.text, voice.voice, outputPath, entry, 2
            );
            
            if (success) stats.successCount++;
            else stats.failCount++;
            
            // Adjust every 10 requests
            if (completed % 10 === 0) {
                adjustConcurrency(stats, limit);
            }
        })
    );
    
    await Promise.all(tasks);
};
```

### Adaptive Logic
```typescript
function adjustConcurrency(stats: ConcurrencyStats, limit: pLimit.Limit): void {
    const successRate = stats.successCount / (stats.successCount + stats.failCount);
    
    if (successRate > 0.95 && stats.currentLimit < 15) {
        // High success → increase concurrency
        stats.currentLimit = Math.min(stats.currentLimit + 2, 15);
        limit.concurrency = stats.currentLimit;
    } else if (successRate < 0.80 && stats.currentLimit > 3) {
        // Low success → decrease concurrency
        stats.currentLimit = Math.max(stats.currentLimit - 2, 3);
        limit.concurrency = stats.currentLimit;
    }
}
```

### Auto-Retry with Exponential Backoff
```typescript
async function generateAudioSegmentWithRetry(
    text: string, voiceName: string, outputPath: string,
    entry: SrtEntryParams, maxRetries: number
): Promise<boolean> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const success = await generateAudioSegment(text, voiceName, outputPath, entry);
        if (success) return true;
        
        if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
}
```

### Performance Impact
- **Current**: 100 entries × 2s avg = ~200s (3.3 min)
- **With concurrency 5**: 100 / 5 × 2s = ~40s
- **With adaptive (avg 8)**: 100 / 8 × 2s = ~25s
- **Speed improvement**: 5-8x faster

---

## 5. Smart Preview System

### Strategy
- Randomly select 3 entries from SRT (avoid first/last 2)
- Generate preview audio to temp directory
- Cache previews per voice (24h TTL)
- Auto-cleanup old previews

### Implementation
```typescript
export const generateVoicePreview = async (
    entries: SrtEntryParams[],
    voiceId: string,
    projectPath: string,
    sampleCount = 3
): Promise<PreviewResult> => {
    const previewDir = path.join(projectPath, '.auto-voice-over', 'previews', voiceId);
    
    // Check cache (< 24h old)
    const cacheFile = path.join(previewDir, 'cache.json');
    if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (Date.now() - cache.timestamp < 24 * 60 * 60 * 1000) {
            return cache.result;
        }
    }
    
    // Select random entries (skip first/last 2)
    const validRange = entries.slice(2, -2);
    const selectedIndices = randomSelect(validRange, sampleCount);
    
    // Generate samples
    const samples = [];
    for (const idx of selectedIndices) {
        const entry = validRange[idx];
        const outputPath = path.join(previewDir, `sample_${entry.index}.mp3`);
        await generateAudioSegment(entry.text, voiceId, outputPath, entry);
        samples.push({ index: entry.index, text: entry.text, audioPath: outputPath });
    }
    
    // Cache result
    fs.writeFileSync(cacheFile, JSON.stringify({
        timestamp: Date.now(),
        result: { voiceId, samples }
    }));
    
    return { voiceId, samples };
};
```

### UX Flow
1. User selects voice from dropdown
2. Clicks "🔊 Preview" button
3. Loading spinner (1-3s if not cached, instant if cached)
4. Plays 3 samples sequentially with 500ms pause
5. Can click again to replay

---

## 6. Smart Retry System

### Three-Tier Strategy

**1. Auto-retry (Transparent)**
- Built into `generateAudioSegmentWithRetry()`
- Max 2 retries with exponential backoff (1s, 2s)
- User sees "generating" status

**2. Batch retry (One-click)**
- "Retry all failed" button appears when failures exist
- Retries all failed entries in parallel
- Uses same adaptive concurrency logic

**3. Individual retry (Manual)**
- Existing per-entry "🔄 Tạo lại" button
- For stubborn failures or user preference

### State Management
```typescript
interface EntryState {
    status: 'pending' | 'generating' | 'done' | 'failed' | 'retrying';
    attempts: number;
    lastError?: string;
}

const [entryStates, setEntryStates] = useState<Map<number, EntryState>>(new Map());
const [failedEntries, setFailedEntries] = useState<number[]>([]);
```

### UI Components
```typescript
// Batch retry button
{failedEntries.length > 0 && !isGenerating && (
    <button onClick={handleRetryAllFailed}>
        🔄 Tạo lại {failedEntries.length} đoạn lỗi
    </button>
)}

// Entry list with status
<div className={`entry-item status-${state.status}`}>
    <span>{index}</span>
    <span>
        {state.status === 'done' && '✅ Hoàn thành'}
        {state.status === 'failed' && `❌ Lỗi (${state.attempts} lần thử)`}
    </span>
    {state.status === 'failed' && (
        <button onClick={() => handleRegenerate(index)}>🔄 Tạo lại</button>
    )}
</div>
```

---

## 7. Error Handling & Edge Cases

### Network Failures
- **Timeout**: 30s limit per request
- **No internet**: Detect ECONNREFUSED/ENOTFOUND
- **Rate limiting**: Detect 429 errors, reduce concurrency aggressively

### Error Categorization
```typescript
let errorType = 'Unknown error';
if (err.message.includes('timeout')) errorType = 'Network timeout';
else if (err.message.includes('ECONNREFUSED')) errorType = 'No internet';
else if (err.message.includes('429')) errorType = 'Rate limited';
```

### Rate Limit Handling
```typescript
// In adjustConcurrency()
const rateLimitErrors = recentErrors.filter(e => e.includes('Rate limited')).length;
if (rateLimitErrors > 3) {
    stats.currentLimit = Math.max(stats.currentLimit - 3, 2);
}
```

### Disk Space Check
```typescript
const checkDiskSpace = (outputDir: string, estimatedSize: number): boolean => {
    const stats = fs.statfsSync(outputDir);
    const availableBytes = stats.bavail * stats.bsize;
    return availableBytes > estimatedSize * 2; // 2x safety margin
};
```

### Cancellation Support
```typescript
// Add AbortSignal support
export const generateAllAudio = async (
    entries: SrtEntryParams[],
    langCode: string,
    outputDir: string,
    onProgress: (p: TTSProgress) => void,
    initialConcurrency = 5,
    signal?: AbortSignal
): Promise<string[]> => {
    if (signal?.aborted) return [];
    
    const tasks = entries.map((entry, i) => 
        limit(async () => {
            if (signal?.aborted) throw new Error('Cancelled');
            // ... generate audio
        })
    );
};
```

### Edge Cases Covered
- ✅ Network timeout (30s)
- ✅ No internet connection
- ✅ Rate limiting (429)
- ✅ Disk space exhaustion
- ✅ Corrupted/empty SRT
- ✅ User cancellation
- ✅ Empty text entries
- ✅ File write failures

---

## 8. Testing Strategy

### Unit Tests
```typescript
// src/services/__tests__/PiperService.test.ts
describe('generateAudioSegment', () => {
    it('should generate audio for valid text', async () => { ... });
    it('should handle empty text gracefully', async () => { ... });
    it('should timeout after 30s', async () => { ... });
});

describe('generateAllAudio - Parallel', () => {
    it('should generate multiple files in parallel', async () => { ... });
    it('should adapt concurrency based on success rate', async () => { ... });
});

describe('generateVoicePreview', () => {
    it('should generate 3 random samples', async () => { ... });
    it('should use cache for repeated previews', async () => { ... });
});
```

### Integration Tests
```typescript
// src/ipc/__tests__/audio.integration.test.ts
describe('Audio Generation IPC', () => {
    it('should handle full generation workflow', async () => { ... });
    it('should handle retry-failed-audio', async () => { ... });
});
```

### Manual Testing Checklist
- [ ] Voice selection works for all 11 languages
- [ ] Preview generates 3 samples and plays sequentially
- [ ] Parallel generation is 3-5x faster
- [ ] Auto-retry works (check console logs)
- [ ] Batch retry button appears and works
- [ ] Individual retry works
- [ ] Error messages are clear
- [ ] Cancellation stops generation
- [ ] Disk space warning appears when low

### Performance Benchmarks
- Target: < 60s for 100 entries (vs ~200s sequential)
- Success rate: > 95% with auto-retry
- Memory usage: No significant increase

---

## 9. Migration & Rollout Plan

### Backward Compatibility
```typescript
// Support old projects without voice config
export function getVoiceForLanguage(lang: string, projectPath?: string): string {
    if (projectPath) {
        const configPath = path.join(projectPath, '.auto-voice-over', 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.voicePreferences?.[lang]) {
                return config.voicePreferences[lang];
            }
        }
    }
    
    // Fallback to old VOICE_MAP default
    return VOICE_MAP[lang]?.voice || VOICE_PRESETS[lang][0].id;
}
```

### Config Versioning
```typescript
interface ProjectConfig {
    version: number;  // Start at 1
    voicePreferences?: Record<string, string>;
    concurrencySettings?: { initial: number; min: number; max: number; };
}
```

### Rollout Phases

**Phase 1: Foundation (Day 1-2)**
- Add `p-limit` dependency
- Create `VoicePresets.ts`
- Update `generateAllAudio()` with parallel logic
- Add retry wrapper
- Unit tests for core functions

**Phase 2: Voice Selection UI (Day 2-3)**
- Create `VoiceSelector.tsx`
- Create `VoiceModal.tsx`
- Integrate into `AudioGeneratePhase.tsx`
- Project config persistence

**Phase 3: Preview System (Day 3)**
- Implement `generateVoicePreview()`
- Add IPC handler
- Preview UI integration
- Caching logic

**Phase 4: Retry UI (Day 4)**
- Update progress tracking
- Add "Retry all failed" button
- Entry list with status indicators
- Error message display

**Phase 5: Polish & Testing (Day 4-5)**
- Error handling for edge cases
- Cancellation support
- Integration tests
- Performance testing
- Manual testing
- Documentation updates

### Rollback Plan
```typescript
// Keep old sequential function as fallback
export const generateAllAudioSequential = async (...) => {
    // Original implementation
};

// Environment variable to force sequential
if (process.env.FORCE_SEQUENTIAL_TTS === 'true') {
    return generateAllAudioSequential(...);
}
```

### Documentation Updates
- [ ] Rename `.docs/modules/PiperService.md` → `TTSService.md`
- [ ] Rewrite to reflect Edge TTS (not Piper)
- [ ] Update README.md with new features
- [ ] Add CHANGELOG.md entry
- [ ] User guide with screenshots

---

## 10. Success Metrics

### Performance
- Generation time: < 60s for 100 entries (target: 25-40s)
- Success rate: > 95% with auto-retry
- Concurrency adaptation: 3-15 range based on network

### User Experience
- Voice preview: < 3s first time, instant on cache hit
- Retry success rate: > 90% for failed entries
- Error clarity: All errors have actionable messages

### Code Quality
- Test coverage: > 80% for new code
- No breaking changes
- Backward compatible with existing projects

---

## 11. Release Notes Draft

```markdown
# v2.0.0 - TTS System Enhancement (2026-04-30)

## 🚀 New Features
- **3-5x faster audio generation** with adaptive parallel processing
- **Voice selection**: Choose from multiple voices per language
- **Smart preview**: Hear voice samples before generating all audio
- **Improved retry system**: Auto-retry + batch retry + individual retry

## 🔧 Improvements
- Better error messages for network issues
- Progress tracking shows per-entry status
- Voice preferences saved per project
- Disk space check before generation

## 🐛 Bug Fixes
- Fixed timeout issues with slow networks
- Better handling of empty text entries
- Cleanup of temporary preview files

## ⚠️ Breaking Changes
None - fully backward compatible with existing projects

## 📊 Performance
- 100 entries: ~25-40s (was ~200s)
- Success rate: >95% with auto-retry
- Memory usage: Unchanged
```

---

## Appendix: Dependencies

### New Dependencies
```json
{
  "dependencies": {
    "p-limit": "^5.0.0"
  }
}
```

### Existing Dependencies (unchanged)
- `msedge-tts`: ^2.0.4
- `electron`: Current version
- `react`: Current version

---

**End of Design Document**
