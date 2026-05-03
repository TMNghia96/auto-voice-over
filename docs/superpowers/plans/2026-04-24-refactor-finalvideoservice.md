# FinalVideoService Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify FinalVideoService by removing unnecessary steps (audio concatenation, fade duration), fixing inconsistencies, and improving reliability.

**Architecture:** Remove redundant audio concatenation step since audio is already muxed into video segments. Simplify validation logic. Add retry mechanism for muxing. Clean up unused parameters.

**Tech Stack:** TypeScript, FFmpeg, Electron

---

## File Structure

**Files to modify:**
- `src/services/FinalVideoService.ts` - Main service, remove audio concat step, clean up parameters
- `src/services/audio/AudioProcessor.ts` - Remove fadeDuration parameter from constructor
- `src/services/video/VideoProcessor.ts` - Add retry logic for muxing
- `src/components/common/CreateFinalVideoPhase.tsx` - Already updated (no changes needed)

**Files to review:**
- `src/services/video/SegmentValidator.ts` - May need simplification (future task)

---

## Task 1: Remove fadeDuration parameter from AudioProcessor

**Files:**
- Modify: `src/services/audio/AudioProcessor.ts:145-149`

- [ ] **Step 1: Read current AudioProcessor constructor**

```bash
# Verify current signature
grep -A 5 "constructor" src/services/audio/AudioProcessor.ts
```

Expected: Constructor has `fadeDuration` parameter

- [ ] **Step 2: Remove fadeDuration from constructor signature**

Edit `src/services/audio/AudioProcessor.ts:145`:

```typescript
constructor(ffmpegPath: string, duckVolume: number = 0.15) {
    this.ffmpegPath = ffmpegPath;
    this.duckVolume = duckVolume;
}
```

Remove:
- Line 142: `private fadeDuration: number;` field declaration
- Line 148: `this.fadeDuration = fadeDuration;` assignment

- [ ] **Step 3: Verify no references to this.fadeDuration remain**

```bash
grep -n "this.fadeDuration" src/services/audio/AudioProcessor.ts
```

Expected: No matches (already removed in previous refactor)

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/services/audio/AudioProcessor.ts
git commit -m "refactor: remove unused fadeDuration parameter from AudioProcessor"
```

---

## Task 2: Remove audio concatenation step from FinalVideoService

**Files:**
- Modify: `src/services/FinalVideoService.ts:221-236`

- [ ] **Step 1: Read current audio concatenation code**

```bash
# View lines 221-236
sed -n '221,236p' src/services/FinalVideoService.ts
```

Expected: See concatenateAudio call and drift verification

- [ ] **Step 2: Remove audio concatenation step**

Delete lines 221-236 in `src/services/FinalVideoService.ts`:

```typescript
// DELETE THIS ENTIRE BLOCK:
// 5. Concatenate audio
onProgress({ status: 'concatenating', progress: 55, detail: 'Đang kết dính luồng âm thanh...' });

const finalAudioWav = await audioProcessor.concatenateAudio(
    audioResult.segmentPaths,
    tempDir
);

// Verify audio sync
const totalExpected = segments.reduce((sum, s) => sum + s.targetDuration, 0);
const totalActual = await getMediaDuration(finalAudioWav);
const finalDrift = totalActual - totalExpected;

if (Math.abs(finalDrift) > 0.1) {
    console.warn(`[Sync] Final audio drift: ${finalDrift.toFixed(3)}s (expected: ${totalExpected.toFixed(2)}s, actual: ${totalActual.toFixed(2)}s)`);
}
```

- [ ] **Step 3: Update step numbers in comments**

After deletion, renumber comments:
- "// 6. Validate segments" → "// 5. Validate segments"
- "// 7. Process video segments" → "// 6. Process video segments"
- "// 8. Mux each video segment" → "// 7. Mux each video segment"
- "// 9. Concatenate muxed segments" → "// 8. Concatenate muxed segments"

- [ ] **Step 4: Update progress percentages**

Adjust progress values to fill the gap:
- Line ~239 (Validate): `progress: 55` (was 60)
- Line ~249 (Process video): `progress: 60` (was 65)
- Line ~265 (Process video callback): `60 + Math.round(pct * 15)` (was 65)
- Line ~275 (Mux segments): `progress: 75` (was 80)
- Line ~282 (Mux callback): `75 + Math.round(pct * 10)` (was 80)
- Line ~292 (Concatenate): `progress: 85` (was 90)

- [ ] **Step 5: Build to verify no errors**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/services/FinalVideoService.ts
git commit -m "refactor: remove unnecessary audio concatenation step"
```

---

## Task 3: Remove fadeDuration parameter from FinalVideoService

**Files:**
- Modify: `src/services/FinalVideoService.ts:115-133, 205`

- [ ] **Step 1: Remove fadeDuration from function signature**

Edit `src/services/FinalVideoService.ts:115-120`:

```typescript
export const createFinalVideo = async (
    projectPath: string,
    onProgress: (p: FinalVideoProgress) => void,
    duckVolume: number = 0.15,
    config?: FinalVideoConfig
): Promise<string | null> => {
```

Remove line 119: `fadeDuration: number = 0.5,`

- [ ] **Step 2: Remove fadeDuration from FinalVideoConfig interface**

Edit `src/services/FinalVideoService.ts:38-42`:

```typescript
export interface FinalVideoConfig {
    duckVolume?: number;
    encoderPreference?: 'gpu' | 'cpu' | 'auto';
}
```

Remove line 40: `fadeDuration?: number;`

- [ ] **Step 3: Update config merge to remove fadeDuration**

Edit `src/services/FinalVideoService.ts:128-133`:

```typescript
const finalConfig: FinalVideoConfig = {
    duckVolume,
    encoderPreference: 'gpu',
    ...config
};
```

Remove line 130: `fadeDuration,`
Change line 131: `encoderPreference: 'auto',` → `encoderPreference: 'gpu',`

- [ ] **Step 4: Update AudioProcessor instantiation**

Edit `src/services/FinalVideoService.ts:205`:

```typescript
const audioProcessor = new AudioProcessor(ffmpegPath, finalConfig.duckVolume!);
```

Remove second parameter: `, finalConfig.fadeDuration!`

- [ ] **Step 5: Build to verify no errors**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/services/FinalVideoService.ts
git commit -m "refactor: remove unused fadeDuration parameter from FinalVideoService"
```

---

## Task 4: Add retry logic for segment muxing

**Files:**
- Modify: `src/services/video/VideoProcessor.ts:219-267`

- [ ] **Step 1: Read current muxSegmentsWithAudio implementation**

```bash
sed -n '219,267p' src/services/video/VideoProcessor.ts
```

Expected: See muxSegmentsWithAudio without retry logic

- [ ] **Step 2: Add retry wrapper function**

Add after line 267 in `src/services/video/VideoProcessor.ts`:

```typescript
  /**
   * Mux a single segment with retry logic
   */
  private async muxSegmentWithRetry(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    index: number,
    maxRetries: number = 3
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await execFileAsync('ffmpeg', [
          '-i', videoPath,
          '-i', audioPath,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          '-y',
          outputPath,
        ]);

        return; // Success
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Segment ${index} mux attempt ${attempt}/${maxRetries} failed:`,
          lastError.message
        );

        if (attempt < maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to mux segment ${index} after ${maxRetries} attempts: ${lastError?.message}`
    );
  }
```

- [ ] **Step 3: Update muxSegmentsWithAudio to use retry wrapper**

Edit `src/services/video/VideoProcessor.ts:219-267`, replace the muxPromises map:

```typescript
    const muxPromises = videoSegmentPaths.map((videoPath, index) =>
      limit(async () => {
        const audioPath = audioSegmentPaths[index];
        const muxedPath = path.join(tempDir, `muxed_${index}.mp4`);

        await this.muxSegmentWithRetry(
          videoPath,
          audioPath,
          muxedPath,
          index,
          this.config.maxRetries
        );

        completed++;
        onProgress(completed / videoSegmentPaths.length);

        return muxedPath;
      })
    );
```

- [ ] **Step 4: Build to verify no errors**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/services/video/VideoProcessor.ts
git commit -m "feat: add retry logic for segment muxing"
```

---

## Task 5: Improve temp directory cleanup

**Files:**
- Modify: `src/services/FinalVideoService.ts:300-302`

- [ ] **Step 1: Read current cleanup code**

```bash
sed -n '300,302p' src/services/FinalVideoService.ts
```

Expected: See immediate cleanup after render

- [ ] **Step 2: Add delay before cleanup**

Edit `src/services/FinalVideoService.ts:300-302`:

```typescript
        // Cleanup - delay to allow Windows to release file locks
        await new Promise(resolve => setTimeout(resolve, 500));
        tempManager.unregister(tempDir);
        await tempManager.cleanup();
```

- [ ] **Step 3: Wrap cleanup in try-catch**

Edit `src/services/FinalVideoService.ts:300-305`:

```typescript
        // Cleanup - delay to allow Windows to release file locks
        await new Promise(resolve => setTimeout(resolve, 500));
        tempManager.unregister(tempDir);
        try {
            await tempManager.cleanup();
        } catch (cleanupErr) {
            console.warn('[FinalVideoService] Cleanup warning:', cleanupErr);
            // Don't fail the render if cleanup fails
        }
```

- [ ] **Step 4: Apply same pattern to error handler cleanup**

Edit `src/services/FinalVideoService.ts:310-312`:

```typescript
        const tempDir = path.join(projectPath, 'temp_final');
        tempManager.unregister(tempDir);
        try {
            await tempManager.cleanup();
        } catch (cleanupErr) {
            console.warn('[FinalVideoService] Error cleanup warning:', cleanupErr);
        }
```

- [ ] **Step 5: Build to verify no errors**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/services/FinalVideoService.ts
git commit -m "fix: improve temp directory cleanup with delay and error handling"
```

---

## Task 6: Final verification and rebuild

**Files:**
- Build: All modified files

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 2: Package application**

```bash
npm run package
```

Expected: Package succeeds

- [ ] **Step 3: Verify all changes are committed**

```bash
git status
```

Expected: "nothing to commit, working tree clean"

- [ ] **Step 4: Review commit history**

```bash
git log --oneline -6
```

Expected: See 5 commits from this refactor

---

## Summary of Changes

**Removed:**
- ✅ Audio concatenation step (unnecessary, audio already in muxed segments)
- ✅ fadeDuration parameter (fade logic already removed)
- ✅ Inconsistent encoderPreference default

**Added:**
- ✅ Retry logic for segment muxing (3 attempts with exponential backoff)
- ✅ Improved cleanup with delay and error handling

**Fixed:**
- ✅ Progress percentages adjusted after removing audio concat step
- ✅ Step numbering in comments

**Performance impact:**
- Faster render (no audio concatenation overhead)
- More reliable (retry on mux failures)
- Better cleanup (fewer temp file issues)

---

## Testing Checklist

After implementation, verify:
- [ ] Render completes successfully on project `200conongdot`
- [ ] No audio concatenation step in progress UI
- [ ] Muxing retries on failure (test by killing ffmpeg mid-mux)
- [ ] Temp directory cleanup succeeds
- [ ] Final video has correct audio sync
- [ ] Final video plays smoothly without stuttering
