# SRT Timeline Exporter - Design Spec

**Date:** 2026-05-06
**Status:** Approved
**Module:** `src/services/srt/SrtTimelineExporter.ts`

---

## 1. Purpose

Xuất file SRT đã dịch với timestamp được remap theo timeline thực tế của video final.
Do quá trình giãn/nén tốc độ video và audio trong `FinalVideoService`, timeline của
video đầu ra khác với timeline gốc. File SRT xuất ra phải đồng bộ chính xác với video final.

## 2. Problem Statement

Pipeline `FinalVideoService` thực hiện các biến đổi:

| Bước | Biến đổi | Ảnh hưởng timeline |
|------|----------|---------------------|
| `buildSegmentMap` | Gán audioSpeed, videoSpeed cho mỗi segment | Segment gốc 3s có thể thành 3.2s output |
| `processAudioSegments` | Mix background + TTS → actualDuration thực tế | Duration thực tế có thể khác targetDuration |
| `validateAndAdjust` | Tính `adjustedVideoSpeed = videoDuration / actualDuration` | `videoStart`/`videoEnd` không đổi, nhưng output duration = actualDuration |

→ **Timeline video final = cumulative sum của `actualDuration` qua tất cả segment (gồm cả gap)**

## 3. Design

### 3.1 Architecture

```
┌──────────────────────────────────────────────────────────┐
│ FinalVideoService.createFinalVideo()                     │
│                                                          │
│  validateAndAdjust() → validatedSegments                 │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────────────────────────────┐                │
│  │ SrtTimelineExporter.export()        │  ← MICROSERVICE │
│  │                                     │                 │
│  │  Input:  validatedSegments[]        │                 │
│  │          translatedSrtContent       │                 │
│  │          outputPath                 │                 │
│  │  Output:  {lang}.srt (written)      │                 │
│  └─────────────────────────────────────┘                │
│       │                                                  │
│       ▼                                                  │
│  buildVideoChunks() → videoChunks                        │
│       │                                                  │
│       ▼                                                  │
│  ... encode → concat → mux                               │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Class Interface

```typescript
// src/services/srt/SrtTimelineExporter.ts

import { ValidatedSegment } from '../video/types';
import { SrtEntry, parseSrt, stringifySrt, msToTime } from '../../lib/SrtOptimizer';
import fs from 'fs';

export class SrtTimelineExporter {
    export(
        validatedSegments: ValidatedSegment[],
        translatedSrtContent: string,
        outputPath: string
    ): string;
}
```

### 3.3 Algorithm

```
function export(validatedSegments, translatedSrtContent, outputPath):
    // 1. Parse translated SRT → Map<index, text>
    translatedEntries = parseSrt(translatedSrtContent)
    textMap = {}
    for entry in translatedEntries:
        textMap[entry.index] = entry.text

    // 2. Build adjusted SRT entries with cumulative timeline
    currentTimeMs = 0
    srtEntries = []

    for seg in validatedSegments:
        speed = seg.adjustedVideoSpeed || seg.videoSpeed || 1.0
        outputDurationMs = (seg.videoDuration / speed) * 1000  // = actualDuration

        if seg.type === 'dubbed' AND seg.index != null:
            text = textMap[seg.index] || ''
            if text:
                srtEntries.push({
                    index: srtEntries.length + 1,         // re-index 1-based
                    startTime: msToTime(currentTimeMs),
                    endTime:   msToTime(currentTimeMs + outputDurationMs),
                    text: text
                })

        currentTimeMs += outputDurationMs  // gap cũng được cộng dồn

    // 3. Write file
    content = stringifySrt(srtEntries)
    fs.writeFileSync(outputPath, content, 'utf-8')
    return outputPath
```

### 3.4 Timeline Calculation Example

```
            Original Timeline              Actual Durations         Final Timeline
            ===================================================    ====================
Seg 0:      1.0s ─── 4.0s (dubbed #1)      actualDur = 3.214s      0.000s ─── 3.214s
Seg 1:      4.0s ─── 5.0s (gap)            actualDur = 1.000s      3.214s ─── 4.214s
Seg 2:      5.0s ─── 7.0s (dubbed #2)      actualDur = 2.000s      4.214s ─── 6.214s
Seg 3:      7.0s ─── 8.5s (gap)            actualDur = 1.500s      6.214s ─── 7.714s
Seg 4:      8.5s ─── 12.0s (dubbed #3)     actualDur = 3.500s      7.714s ─── 11.214s

Final timeline của video:  0.000s  →  11.214s
SRT gốc của video:         1.000s  →  12.000s
```

## 4. Dependencies

| Dependency | Source | Status |
|-----------|--------|--------|
| `ValidatedSegment` type | `src/services/video/types.ts` | Already exists |
| `SrtEntry` type | `src/lib/SrtOptimizer.ts` | Already exists, exported |
| `parseSrt()` | `src/lib/SrtOptimizer.ts` | Already exists, exported |
| `stringifySrt()` | `src/lib/SrtOptimizer.ts` | Already exists, exported |
| `msToTime()` | `src/lib/SrtOptimizer.ts` | **Need to export** (currently private `const`) |

### Change to `SrtOptimizer.ts`

Line 23: change `const msToTime` to `export const msToTime`

## 5. Integration Points

### 5.1 `FinalVideoService.ts`

After line 388 (validateAndAdjust), before line 397 (buildVideoChunks):

```typescript
const validatedSegments = validator.validateAndAdjust(
    segments, audioResult.actualDurations, videoDuration
);

// SRT export (non-fatal)
if (lang) {
    try {
        const exporter = new SrtTimelineExporter();
        const translatedPath = resolveTranslatedSrt(projectPath, lang);
        if (translatedPath) {
            const content = fs.readFileSync(translatedPath, 'utf-8');
            const outputDir = path.join(projectPath, 'final');
            fs.mkdirSync(outputDir, { recursive: true });
            const langCode = path.basename(translatedPath, '.srt');
            const outputPath = path.join(outputDir, `${langCode}.srt`);
            exporter.export(validatedSegments, content, outputPath);
        }
    } catch (err) {
        console.warn('[FinalVideoService] SRT export failed (non-fatal):', err);
    }
}

const videoChunks = buildVideoChunks(validatedSegments);
```

### 5.2 `createFinalVideo` signature update

Add `lang?: string` parameter. Auto-detect from `project/translate/` if not provided.

### 5.3 IPC Handler (`src/ipc/video.ts`)

Accept `lang` in options, pass to `createFinalVideo`.

### 5.4 Preload (`src/preload.ts`)

Update `createFinalVideo` type to include optional `lang` in options.

### 5.5 Auto Pipeline (`ProjectAutoPage.tsx`)

Pass `targetLanguage` as `lang` in the `createFinalVideo` call.

### 5.6 Manual Mode (`CreateFinalVideoPhase.tsx`)

No changes needed. `lang` = undefined → auto-detect from `project/translate/`.

## 6. Error Handling & Edge Cases

| Edge Case | Handling |
|-----------|----------|
| `adjustedVideoSpeed` = 0 hoặc NaN | Fallback: `speed \|\| seg.videoSpeed \|\| 1.0` |
| Segment `index` không match entry nào trong translated SRT | Bỏ qua text rỗng, không tạo entry |
| Không tìm thấy file SRT dịch trong `translate/` | Log warning, bỏ qua export (non-fatal) |
| SRT đã dịch có ít entry hơn số dubbed segment | Chỉ export những entry có text khớp |
| Segment "gap" xuất hiện trước segment "dubbed" đầu tiên | Gap vẫn được cộng dồn vào timeline, SRT entry đầu tiên bắt đầu sau gap |
| `createFinalVideo` bị cancel giữa chừng | SRT export chạy trước khi encode video, atomic write |

## 7. Non-Functional Requirements

- **Non-fatal**: SRT export fail không làm hỏng video final
- **Zero network**: Không gọi API, thuần file I/O
- **Performance**: O(n) với n = số segment
- **Idempotent**: Ghi đè file nếu đã tồn tại

## 8. File Manifest

| # | File | Action | Lines Changed |
|---|------|--------|---------------|
| 1 | `src/services/srt/SrtTimelineExporter.ts` | CREATE | ~50 lines |
| 2 | `src/lib/SrtOptimizer.ts` | EDIT | 1 line (export `msToTime`) |
| 3 | `src/services/FinalVideoService.ts` | EDIT | ~25 lines (param + call + auto-detect) |
| 4 | `src/ipc/video.ts` | EDIT | ~3 lines (accept lang) |
| 5 | `src/preload.ts` | EDIT | 2 lines (type signature) |
| 6 | `src/windows/main/ProjectAutoPage.tsx` | EDIT | 1 line (pass lang) |

**Total:** 1 new file, 5 files edited, ~82 lines net change.
