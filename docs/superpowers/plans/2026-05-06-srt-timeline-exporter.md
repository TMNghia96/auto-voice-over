# SRT Timeline Exporter - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SRT subtitle export with adjusted timeline matching the final video output, as a standalone microservice integrated into the FinalVideoService pipeline.

**Architecture:** New `SrtTimelineExporter` class in `src/services/srt/` takes validated segments + translated SRT content and computes final timeline via cumulative `actualDuration`. Integrated into `createFinalVideo` after `validateAndAdjust`, before `buildVideoChunks`. Non-fatal on failure.

**Tech Stack:** TypeScript (Node.js/Electron main process), no new dependencies. Reuses existing `parseSrt`, `stringifySrt`, `msToTime` from `src/lib/SrtOptimizer.ts`.

---

### Task 1: Export `msToTime` from SrtOptimizer.ts

**Files:**
- Modify: `src/lib/SrtOptimizer.ts:23`

- [ ] **Step 1: Export msToTime**

Change line 23 in `src/lib/SrtOptimizer.ts` from:

```typescript
const msToTime = (ms: number): string => {
```

to:

```typescript
export const msToTime = (ms: number): string => {
```

- [ ] **Step 2: Verify the change compiles**

Run: `npx tsc --noEmit src/lib/SrtOptimizer.ts`
Expected: No type errors related to msToTime export.

- [ ] **Step 3: Commit**

```bash
git add src/lib/SrtOptimizer.ts
git commit -m "feat: export msToTime for SrtTimelineExporter"
```

---

### Task 2: Create SrtTimelineExporter class

**Files:**
- Create: `src/services/srt/SrtTimelineExporter.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p src/services/srt
```

- [ ] **Step 2: Write SrtTimelineExporter.ts**

```typescript
import fs from 'fs';
import path from 'path';
import { ValidatedSegment } from '../video/types';
import { SrtEntry, parseSrt, stringifySrt, msToTime } from '../../lib/SrtOptimizer';

export class SrtTimelineExporter {
    /**
     * Export a translated SRT with timestamps adjusted to the final video timeline.
     * 
     * Non-fatal: if the translated SRT content is empty or unparseable,
     * returns outputPath with empty content but does not throw.
     *
     * @param validatedSegments   Segment array from SegmentValidator.validateAndAdjust()
     * @param translatedSrtContent Raw SRT string content of the translated subtitles
     * @param outputPath           Full path where the adjusted SRT file will be written
     * @returns                    The outputPath that was written
     */
    export(
        validatedSegments: ValidatedSegment[],
        translatedSrtContent: string,
        outputPath: string
    ): string {
        const translatedEntries = parseSrt(translatedSrtContent);

        const textMap = new Map<number, string>();
        for (const entry of translatedEntries) {
            textMap.set(entry.index, entry.text);
        }

        const srtEntries: SrtEntry[] = [];
        let currentTimeMs = 0;

        for (const seg of validatedSegments) {
            const speed = seg.adjustedVideoSpeed || seg.videoSpeed || 1.0;
            const outputDurationMs = (seg.videoDuration / speed) * 1000;

            if (seg.type === 'dubbed' && seg.index != null) {
                const text = textMap.get(seg.index);
                if (text) {
                    srtEntries.push({
                        index: srtEntries.length + 1,
                        startTime: msToTime(currentTimeMs),
                        endTime: msToTime(currentTimeMs + outputDurationMs),
                        text,
                    });
                }
            }

            currentTimeMs += outputDurationMs;
        }

        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const content = stringifySrt(srtEntries);
        fs.writeFileSync(outputPath, content, 'utf-8');

        return outputPath;
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No type errors in `src/services/srt/SrtTimelineExporter.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/services/srt/SrtTimelineExporter.ts
git commit -m "feat: add SrtTimelineExporter microservice"
```

---

### Task 3: Integrate into FinalVideoService.ts

**Files:**
- Modify: `src/services/FinalVideoService.ts:235-508`

- [ ] **Step 1: Add import at top**

After line 10 (`import { VideoProcessor } from './video/VideoProcessor';`), add:

```typescript
import { SrtTimelineExporter } from './srt/SrtTimelineExporter';
```

- [ ] **Step 2: Add `lang` to `FinalVideoConfig` interface**

At line 38-41, change:

```typescript
export interface FinalVideoConfig {
    duckVolume?: number;
    encoderPreference?: 'gpu' | 'cpu' | 'auto';
}
```

to:

```typescript
export interface FinalVideoConfig {
    duckVolume?: number;
    encoderPreference?: 'gpu' | 'cpu' | 'auto';
    lang?: string;
}
```

- [ ] **Step 3: Add helper function `resolveTranslatedSrt`**

After `findOriginalVideo` (line 189-195), add:

```typescript
const resolveTranslatedSrt = (projectPath: string, lang?: string): string | null => {
    const translateDir = path.join(projectPath, 'translate');
    if (!fs.existsSync(translateDir)) return null;

    const srtFiles = fs.readdirSync(translateDir).filter(f => f.endsWith('.srt'));
    if (srtFiles.length === 0) return null;

    if (lang) {
        // Exact match by lang code
        const target = srtFiles.find(f => path.basename(f, '.srt') === lang);
        return target ? path.join(translateDir, target) : null;
    }

    // Auto-detect: pick the first .srt file
    return path.join(translateDir, srtFiles[0]);
};
```

- [ ] **Step 4: Insert SRT export after validateAndAdjust, before buildVideoChunks**

At line 392-393 (after `validatedSegments` is computed, before `buildVideoChunks`):

```typescript
const validatedSegments = validator.validateAndAdjust(
    segments,
    audioResult.actualDurations,
    videoDuration
);

// SRT export with adjusted timeline (non-fatal)
const exportLang = finalConfig.lang;
if (exportLang || fs.existsSync(path.join(projectPath, 'translate'))) {
    try {
        const translatedPath = resolveTranslatedSrt(projectPath, exportLang);
        if (translatedPath) {
            const content = fs.readFileSync(translatedPath, 'utf-8');
            const outputDir = path.join(projectPath, 'final');
            const langCode = path.basename(translatedPath, '.srt');
            const outputPath = path.join(outputDir, `${langCode}.srt`);
            const exporter = new SrtTimelineExporter();
            exporter.export(validatedSegments, content, outputPath);
            console.log(`[FinalVideoService] Exported SRT: ${outputPath}`);
        }
    } catch (err) {
        console.warn('[FinalVideoService] SRT export failed (non-fatal):', err);
    }
}

// 6. Build video chunks (merge consecutive same-speed segments)
onProgress({ status: 'rerendering', progress: 55, detail: 'Đang gộp phân đoạn video...' });

const videoChunks = buildVideoChunks(validatedSegments);
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/FinalVideoService.ts
git commit -m "feat: integrate SrtTimelineExporter into FinalVideoService pipeline"
```

---

### Task 4: Update IPC handler to accept lang parameter

**Files:**
- Modify: `src/ipc/video.ts:199`

- [ ] **Step 1: Pass lang from options to createFinalVideo**

Change line 199-213 from:

```typescript
ipcMain.on("create-final-video", async (event, projectPath: string, options?: { backgroundVolume?: number, fadeDuration?: number }) => {
    try {
        await createFinalVideo(
            projectPath, 
            (p) => {
                if (!event.sender.isDestroyed()) {
                    try {
                        event.sender.send("final-video-progress", p);
                    } catch (e) {
                        console.warn("Failed to send progress, window may be closed", e);
                    }
                }
            }, 
            options?.backgroundVolume ?? 0.15
        );
```

to:

```typescript
ipcMain.on("create-final-video", async (event, projectPath: string, options?: { backgroundVolume?: number, fadeDuration?: number, lang?: string }) => {
    try {
        await createFinalVideo(
            projectPath, 
            (p) => {
                if (!event.sender.isDestroyed()) {
                    try {
                        event.sender.send("final-video-progress", p);
                    } catch (e) {
                        console.warn("Failed to send progress, window may be closed", e);
                    }
                }
            }, 
            options?.backgroundVolume ?? 0.15,
            { lang: options?.lang }
        );
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/ipc/video.ts
git commit -m "feat: pass lang parameter to createFinalVideo IPC handler"
```

---

### Task 5: Update preload.ts type signature

**Files:**
- Modify: `src/preload.ts:100`

- [ ] **Step 1: Add lang to options type**

Change line 100 from:

```typescript
createFinalVideo: (projectPath: string, options?: { backgroundVolume?: number, fadeDuration?: number }) => ipcRenderer.send('create-final-video', projectPath, options),
```

to:

```typescript
createFinalVideo: (projectPath: string, options?: { backgroundVolume?: number, fadeDuration?: number, lang?: string }) => ipcRenderer.send('create-final-video', projectPath, options),
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/preload.ts
git commit -m "feat: add lang option to createFinalVideo preload API"
```

---

### Task 6: Pass lang in auto pipeline (ProjectAutoPage.tsx)

**Files:**
- Modify: `src/windows/main/ProjectAutoPage.tsx:286`

- [ ] **Step 1: Pass targetLanguage as lang**

Change line 286 from:

```typescript
window.api.createFinalVideo(projectPath);
```

to:

```typescript
window.api.createFinalVideo(projectPath, { lang: targetLanguage });
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/windows/main/ProjectAutoPage.tsx
git commit -m "feat: pass targetLanguage as lang in auto pipeline"
```

---

### Task 7: Final verification

**Files:**
- All changes from Tasks 1-6

- [ ] **Step 1: Run TypeScript typecheck on entire project**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Check for any lint errors**

Run: `npm run lint` (if available)
Expected: No new lint errors.

- [ ] **Step 3: Quick smoke test - verify new file structure**

```bash
ls src/services/srt/SrtTimelineExporter.ts
```
Expected: File exists.

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
git diff --stat
```
