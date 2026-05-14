# Final Video Stutter Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop final rendered videos from repeating or stuttering at segment/chunk boundaries.

**Architecture:** Use safe render mode by default: decode/re-encode every final video chunk, reset PTS for every chunk, enforce CFR at encode time, and avoid stream-copy concat in final output. Add duration/timestamp checks so bad chunks fail early instead of producing glitchy output.

**Tech Stack:** TypeScript, Vitest, Electron main process services, FFmpeg/FFprobe, H264 GPU/CPU encoders.

---

## File Structure

- Modify: `src/services/FinalVideoService.ts`
  - Final orchestration; choose safe concat path; log final render strategy.

- Modify: `src/services/video/VideoProcessor.ts`
  - Chunk processing; prevent stream-copy chunking by default; add duration verification; re-encode concat safely.

- Modify: `src/services/video/encoders/CPUEncoder.ts`
  - CPU encode args; always reset PTS; always CFR; no audio in chunks.

- Modify: `src/services/video/encoders/GPUEncoder.ts`
  - GPU encode args; same behavior as CPU.

- Modify: `tests/services/video/VideoProcessor.test.ts`
  - Assert 1x-speed chunks are encoded, not copied; assert concat uses re-encode mode where requested.

- Modify: `tests/services/video/encoders/CPUEncoder.test.ts`
  - Assert safe filter args.

- Modify: `tests/services/video/encoders/GPUEncoder.test.ts`
  - Assert safe filter args.

- Optional modify: `src/services/__tests__/FinalVideoService.videostretch.test.ts`
  - Correct misleading ffmpeg `setpts` semantics tests.

- Optional create: `scripts/verify-final-video.ts`
  - Manual verification helper for output duration/fps/frame stats.

---

### Task 1: Fix Test Runtime Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/services/video/encoders/CPUEncoder.test.ts`
- Modify: `tests/services/video/encoders/GPUEncoder.test.ts`
- Modify: `tests/services/video/VideoProcessor.test.ts`

- [ ] **Step 1: Add missing test dependencies**

Run:
```bash
npm install --save-dev jsdom @testing-library/jest-dom @testing-library/react
```

Expected:
```text
added packages
```

- [ ] **Step 2: Mock Electron in video unit tests**

Add near top of each targeted unit test file before importing implementation modules:

```ts
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));
```

Apply to:
- `tests/services/video/encoders/CPUEncoder.test.ts`
- `tests/services/video/encoders/GPUEncoder.test.ts`
- `tests/services/video/VideoProcessor.test.ts`

- [ ] **Step 3: Verify test runner reaches assertions**

Run:
```bash
npm test -- --run tests/services/video/encoders/GPUEncoder.test.ts tests/services/video/encoders/CPUEncoder.test.ts tests/services/video/VideoProcessor.test.ts
```

Expected after only baseline fixes:
```text
Test Files  3 passed (3)
```

If tests fail because assertions are still old, continue to Task 2 and Task 3.

---

### Task 2: Make Encoder Output Timestamp-Safe

**Files:**
- Modify: `tests/services/video/encoders/CPUEncoder.test.ts`
- Modify: `tests/services/video/encoders/GPUEncoder.test.ts`
- Modify: `src/services/video/encoders/CPUEncoder.ts`
- Modify: `src/services/video/encoders/GPUEncoder.ts`

- [ ] **Step 1: Write failing CPU encoder test for speed-change filter**

In `tests/services/video/encoders/CPUEncoder.test.ts`, replace old speed filter expectation with:

```ts
it('should reset timestamps and enforce CFR when changing speed', () => {
  const encoder = new CPUEncoder();
  const options: EncodeOptions = {
    startTime: 0,
    duration: 10,
    videoSpeed: 0.5,
    fps: 30,
    crf: 23,
    preset: 'fast'
  };

  const args = encoder.getEncoderArgs(options);

  expect(args).toContain('-vf');
  const vfIndex = args.indexOf('-vf');
  expect(args[vfIndex + 1]).toBe('setpts=2.000000*(PTS-STARTPTS),fps=30');
});
```

- [ ] **Step 2: Write failing CPU encoder test for 1x speed filter**

In same file, replace old “should not include filter when speed is 1.0” test with:

```ts
it('should reset timestamps and enforce CFR when speed is 1.0', () => {
  const encoder = new CPUEncoder();
  const options: EncodeOptions = {
    startTime: 0,
    duration: 10,
    videoSpeed: 1.0,
    fps: 30,
    crf: 23,
    preset: 'fast'
  };

  const args = encoder.getEncoderArgs(options);

  expect(args).toContain('-vf');
  const vfIndex = args.indexOf('-vf');
  expect(args[vfIndex + 1]).toBe('setpts=PTS-STARTPTS,fps=30');
});
```

- [ ] **Step 3: Write matching GPU encoder tests**

In `tests/services/video/encoders/GPUEncoder.test.ts`, use same two test bodies but instantiate:

```ts
const encoder = new GPUEncoder('nvidia');
```

- [ ] **Step 4: Run tests and verify RED**

Run:
```bash
npm test -- --run tests/services/video/encoders/GPUEncoder.test.ts tests/services/video/encoders/CPUEncoder.test.ts
```

Expected before implementation:
```text
FAIL ... expected 'setpts=2.000000*(PTS-STARTPTS),fps=30'
FAIL ... expected array to contain '-vf'
```

- [ ] **Step 5: Update CPU encoder args**

In `src/services/video/encoders/CPUEncoder.ts`, update `getEncoderArgs()` to:

```ts
getEncoderArgs(options: EncodeOptions): string[] {
  const videoFilter = Math.abs(options.videoSpeed - 1.0) > 0.001
    ? `setpts=${(1 / options.videoSpeed).toFixed(6)}*(PTS-STARTPTS),fps=${options.fps}`
    : `setpts=PTS-STARTPTS,fps=${options.fps}`;

  return [
    '-an',
    '-c:v', 'libx264',
    '-preset', options.preset,
    '-crf', options.crf.toString(),
    '-vf', videoFilter,
    '-r', options.fps.toString(),
    '-g', (options.fps * 2).toString(),
    '-keyint_min', options.fps.toString()
  ];
}
```

- [ ] **Step 6: Update GPU encoder args**

In `src/services/video/encoders/GPUEncoder.ts`, update `getEncoderArgs()` using same `videoFilter`, and keep existing NVIDIA/AMD quality args:

```ts
const args = [
  '-an',
  '-c:v', this.codec,
  '-vf', videoFilter,
  '-r', options.fps.toString(),
  '-g', (options.fps * 2).toString(),
  '-keyint_min', options.fps.toString()
];
```

- [ ] **Step 7: Run tests and verify GREEN**

Run:
```bash
npm test -- --run tests/services/video/encoders/GPUEncoder.test.ts tests/services/video/encoders/CPUEncoder.test.ts
```

Expected:
```text
Test Files  2 passed (2)
```

---

### Task 3: Disable Stream-Copy Chunk Path

**Files:**
- Modify: `tests/services/video/VideoProcessor.test.ts`
- Modify: `src/services/video/VideoProcessor.ts`

- [ ] **Step 1: Write failing test for 1x chunk encode**

Add to `tests/services/video/VideoProcessor.test.ts`:

```ts
describe('processVideoChunks', () => {
  it('should encode 1x-speed chunks instead of stream-copying them', async () => {
    const onProgress = vi.fn();
    const chunks = [
      { videoStart: 0, videoEnd: 5, videoDuration: 5, adjustedVideoSpeed: 1.0 },
    ];

    const result = await videoProcessor.processVideoChunks(
      chunks,
      '/video/original.mp4',
      '/temp',
      onProgress
    );

    expect(result).toEqual([path.join('/temp', 'chunk_0000.mp4')]);
    expect(mockEncoder.encodeSegment).toHaveBeenCalledWith(
      '/video/original.mp4',
      path.join('/temp', 'chunk_0000.mp4'),
      expect.objectContaining({
        startTime: 0,
        duration: 5,
        videoSpeed: 1.0,
        fps: 30,
      })
    );
    expect(onProgress).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:
```bash
npm test -- --run tests/services/video/VideoProcessor.test.ts
```

Expected before implementation:
```text
FAIL ... expected encodeSegment to have been called
```

- [ ] **Step 3: Update `processVideoChunks()`**

In `src/services/video/VideoProcessor.ts`, make all chunks use encoder path:

```ts
const needEncode = chunks;
console.log(`[VideoProcessor] Chunks: ${chunks.length} total, ${needEncode.length} encode, 0 copy (safe render mode)`);

let encoder: VideoEncoder | null = null;
if (needEncode.length > 0) {
  encoder = await this.encoderFactory.createEncoder();
  console.log(`[VideoProcessor] Using ${encoder.type.toUpperCase()} encoder: ${encoder.name}`);
}

const encodeLimit = encoder ? pLimit(encoder.type === 'gpu' ? 4 : 2) : pLimit(1);
```

Inside chunk loop, remove `isCopy` branch and always call:

```ts
console.log(`[VideoProcessor] Encode chunk ${index}: start=${chunk.videoStart.toFixed(2)} dur=${chunk.videoDuration.toFixed(2)} speed=${chunk.adjustedVideoSpeed.toFixed(2)}`);
await this.encodeChunk(encoder!, chunk, index, originalVideo, out);
```

- [ ] **Step 4: Run test and verify GREEN**

Run:
```bash
npm test -- --run tests/services/video/VideoProcessor.test.ts
```

Expected:
```text
Test Files  1 passed (1)
```

---

### Task 4: Disable Final Stream-Copy Concat

**Files:**
- Modify: `src/services/FinalVideoService.ts`
- Optional test: add unit around orchestration if mocking `VideoProcessor` is practical.

- [ ] **Step 1: Replace H264 copy concat branch**

In `src/services/FinalVideoService.ts`, replace:

```ts
if (isSourceH264) {
  await videoProcessor.concatenateCopy(chunkVideoPaths, tempVideoPath);
} else {
  await videoProcessor.concatenateVideo(chunkVideoPaths, tempVideoPath);
}
```

with:

```ts
console.log(`[FinalVideoService] Source is ${videoMeta.codec} → safe re-encode concat`);
await videoProcessor.concatenateVideo(chunkVideoPaths, tempVideoPath, false);
```

- [ ] **Step 2: Run targeted tests**

Run:
```bash
npm test -- --run tests/services/video/encoders/GPUEncoder.test.ts tests/services/video/encoders/CPUEncoder.test.ts tests/services/video/VideoProcessor.test.ts
```

Expected:
```text
Test Files  3 passed (3)
```

---

### Task 5: Add Chunk Duration Verification

**Files:**
- Modify: `src/services/video/VideoProcessor.ts`
- Modify: `tests/services/video/VideoProcessor.test.ts`

- [ ] **Step 1: Add test for duration mismatch failure**

Add a test that stubs duration helper through a small injectable helper if needed. Preferred minimal design: add private `getMediaDuration()` and test public behavior by mocking `child_process.spawn` only if existing test style allows it.

Test intent:
```ts
it('should fail a chunk when encoded duration differs from expected duration', async () => {
  // Arrange one chunk where expected output is 5s but ffprobe returns 5.5s.
  // Act processVideoChunks().
  // Assert rejects with "Chunk 0 duration mismatch".
});
```

- [ ] **Step 2: Implement `getMediaDuration()`**

Add to `VideoProcessor`:

```ts
private getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(getFfprobePath(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ], { windowsHide: true });

    let stdout = '';
    proc.stdout.on('data', data => stdout += data.toString());
    proc.on('close', () => {
      const duration = parseFloat(stdout.trim());
      resolve(Number.isFinite(duration) ? duration : 0);
    });
    proc.on('error', () => resolve(0));
  });
}
```

Also import:
```ts
import { getFfmpegPath, getFfprobePath } from '../EnvironmentService';
```

- [ ] **Step 3: Verify expected chunk duration after encode**

Add after successful `encodeChunk()`:

```ts
const expectedDuration = chunk.videoDuration / Math.max(chunk.adjustedVideoSpeed, 0.001);
const actualDuration = await this.getMediaDuration(out);
if (actualDuration > 0 && Math.abs(actualDuration - expectedDuration) > 0.1) {
  throw new Error(
    `Chunk ${index} duration mismatch: expected ${expectedDuration.toFixed(3)}s, got ${actualDuration.toFixed(3)}s`
  );
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
npm test -- --run tests/services/video/VideoProcessor.test.ts
```

Expected:
```text
Test Files  1 passed (1)
```

---

### Task 6: Correct Misleading `setpts` Semantics Tests

**Files:**
- Modify: `src/services/__tests__/FinalVideoService.videostretch.test.ts`

- [ ] **Step 1: Replace wrong duration assertions**

Use this semantics:

```ts
const calculatePtsMultiplier = (playbackSpeed: number): number => 1 / playbackSpeed;
const outputDuration = (inputDuration: number, playbackSpeed: number): number => {
  return inputDuration * calculatePtsMultiplier(playbackSpeed);
};
```

Add tests:

```ts
it('should lengthen video when playbackSpeed is below 1.0', () => {
  expect(outputDuration(10, 0.5)).toBeCloseTo(20, 3);
});

it('should shorten video when playbackSpeed is above 1.0', () => {
  expect(outputDuration(10, 2.0)).toBeCloseTo(5, 3);
});
```

- [ ] **Step 2: Remove comments claiming `setpts < 1` slows video**

Replace with:
```ts
// FFmpeg setpts multiplier > 1 lengthens video; multiplier < 1 shortens video.
```

- [ ] **Step 3: Run corrected test**

Run:
```bash
npm test -- --run src/services/__tests__/FinalVideoService.videostretch.test.ts
```

Expected:
```text
Test Files  1 passed (1)
```

---

### Task 7: Manual Render Verification

**Files:**
- Optional create: `scripts/verify-final-video.ts`

- [ ] **Step 1: Render known bad project**

Use project that previously showed repeated/stutter frames.

Expected files:
```text
<project>/temp_final/concated_video.mp4
<project>/final/final_video.mp4
```

- [ ] **Step 2: Inspect final video stream**

Run:
```bash
ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate,r_frame_rate,duration,nb_frames -of default=nw=1 "<project>/final/final_video.mp4"
```

Expected:
```text
avg_frame_rate=30/1
r_frame_rate=30/1
duration=<reasonable final duration>
```

- [ ] **Step 3: Inspect audio/video duration delta**

Run:
```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 "<project>/temp_final/concated_video.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "<project>/temp_final/final_mixed_audio.wav"
```

Expected:
```text
absolute difference <= 0.1s
```

- [ ] **Step 4: Watch boundary-heavy sections**

Check timestamps around:
- start/end of dubbed segments
- sections with long TTS audio
- transitions after gaps

Expected:
```text
No repeated frame burst, no visible stutter at boundaries, audio remains aligned.
```

---

### Task 8: Final Verification

**Files:**
- No code changes unless verification exposes failure.

- [ ] **Step 1: Run targeted automated tests**

Run:
```bash
npm test -- --run tests/services/video/encoders/GPUEncoder.test.ts tests/services/video/encoders/CPUEncoder.test.ts tests/services/video/VideoProcessor.test.ts src/services/__tests__/FinalVideoService.videostretch.test.ts
```

Expected:
```text
Test Files  4 passed (4)
```

- [ ] **Step 2: Run typecheck and document known unrelated failures**

Run:
```bash
npx tsc --noEmit --skipLibCheck
```

Expected current known failures may include:
```text
src/__tests__/e2e/tts-workflow.e2e.test.ts ... Playwright Page custom fields
src/services/audio/AudioProcessor.ts ... getFfmpegPath
```

If new failures appear in touched video files, fix before completion.

- [ ] **Step 3: Review diff**

Run:
```bash
git diff -- src/services/FinalVideoService.ts src/services/video/VideoProcessor.ts src/services/video/encoders/CPUEncoder.ts src/services/video/encoders/GPUEncoder.ts tests/services/video/VideoProcessor.test.ts tests/services/video/encoders/CPUEncoder.test.ts tests/services/video/encoders/GPUEncoder.test.ts src/services/__tests__/FinalVideoService.videostretch.test.ts package.json package-lock.json
```

Check:
- No stream-copy path used by final render.
- All chunk encodes include `setpts=...PTS-STARTPTS` and `fps=30`.
- Tests assert behavior, not implementation noise.

---

## Success Criteria

- Targeted video tests pass.
- Final render no longer uses `copyChunk()` for speed `1.0` chunks.
- Final render no longer uses `concatenateCopy()` by default for H264 source.
- Encoded chunks reset PTS and enforce CFR before concat.
- Known bad project renders without repeated/stutter frames at boundaries.
- Any remaining typecheck failures are documented as pre-existing or outside touched files.

## Rollback Plan

If render time becomes unacceptable but output is smooth:
- Keep safe mode as default.
- Add explicit experimental config later:
```ts
finalVideoMode: 'safe' | 'fast-copy'
```
- Only enable copy mode when chunk boundaries are keyframe-aligned and ffprobe validates clean PTS/DTS.

Do not restore H264 stream-copy as default without keyframe/timestamp validation.
