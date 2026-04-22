# FinalVideoService Rebuild - Testing Guide

**Date:** 2026-04-22  
**Status:** ✅ Code Complete - Ready for Real-World Testing

---

## Current Status

### ✅ Completed
- All 6 phases implemented
- 187 tests passing (unit + integration)
- Code refactored (968 → 259 lines)
- All modules working in isolation

### 🔄 Next: Real-World Testing
Modules require Electron app context (EnvironmentService, getFfmpegPath).
Cannot run standalone - must test within the app.

---

## How to Test with Real Video

### Option 1: Test via Electron App (Recommended)

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Load project:**
   - Open project: `C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot`
   - Project has 349 segments (good stress test)

3. **Run video generation:**
   - Click "Generate Final Video"
   - Monitor console for:
     - Encoder type used (GPU/CPU)
     - Progress updates
     - Encoding speed
     - Any errors

4. **Verify output:**
   - Check video/audio sync
   - Verify no frozen frames
   - Measure total render time

### Option 2: Add Test Button to UI

Add a test button that calls:
```typescript
import { createFinalVideo } from './services/FinalVideoService';

// Test with GPU
await createFinalVideo(projectPath, onProgress, {
  encoderPreference: 'gpu'
});

// Test with CPU
await createFinalVideo(projectPath, onProgress, {
  encoderPreference: 'cpu'
});

// Test with Auto (default)
await createFinalVideo(projectPath, onProgress, {
  encoderPreference: 'auto'
});
```

### Option 3: Integration Test in Electron Context

Create test in `src/main.ts` or IPC handler:
```typescript
ipcMain.handle('test-finalvideo-rebuild', async (event, projectPath) => {
  const results = {
    gpu: null,
    cpu: null,
    auto: null
  };

  // Test GPU
  const startGpu = Date.now();
  try {
    await createFinalVideo(projectPath, (p) => {
      event.sender.send('test-progress', { mode: 'gpu', progress: p });
    }, { encoderPreference: 'gpu' });
    results.gpu = { success: true, duration: Date.now() - startGpu };
  } catch (error) {
    results.gpu = { success: false, error: error.message };
  }

  // Test CPU
  const startCpu = Date.now();
  try {
    await createFinalVideo(projectPath, (p) => {
      event.sender.send('test-progress', { mode: 'cpu', progress: p });
    }, { encoderPreference: 'cpu' });
    results.cpu = { success: true, duration: Date.now() - startCpu };
  } catch (error) {
    results.cpu = { success: false, error: error.message };
  }

  return results;
});
```

---

## Expected Results

### Performance Targets (from design spec)

**With 200conongdot project (349 segments):**

| Encoder | Target Time | Expected Speedup |
|---------|-------------|------------------|
| GPU     | < 5 min     | 5-10x faster     |
| CPU     | < 10 min    | Baseline         |

### Success Criteria

- ✅ All 349 segments encode successfully
- ✅ Video syncs perfectly with audio (< 0.1s drift)
- ✅ No frozen frames
- ✅ GPU encoding works (AMD/NVIDIA)
- ✅ CPU fallback works when GPU unavailable
- ✅ Progress reporting accurate
- ✅ Error handling graceful

---

## What to Monitor

### 1. Console Output
```
[VideoProcessor] Using encoder: h264_nvenc (gpu)
[VideoProcessor] Processing 349 segments with concurrency: 6
[VideoProcessor] Segment 1/349 encoded in 0.5s
[VideoProcessor] Segment 2/349 encoded in 0.4s
...
[VideoProcessor] All segments encoded in 245s
[VideoProcessor] Concatenating video...
[VideoProcessor] Muxing with audio...
✅ Final video created: output.mp4
```

### 2. Performance Metrics
- **Encoding speed**: segments/second
- **Total time**: start to finish
- **GPU utilization**: check Task Manager
- **Memory usage**: should be stable
- **CPU usage**: lower with GPU

### 3. Output Quality
- **Video/audio sync**: Play and verify
- **No frozen frames**: Check transitions
- **File size**: Reasonable (not too large/small)
- **Playback**: Smooth in media player

---

## Troubleshooting

### GPU Not Detected
```
[EncoderFactory] NVIDIA encoder not available
[EncoderFactory] AMD encoder not available
[EncoderFactory] Falling back to CPU encoder
```
**Solution:** Check GPU drivers, FFmpeg build with GPU support

### Encoding Failures
```
[VideoProcessor] Segment 42 failed after 3 retries
[VideoProcessor] Falling back to CPU encoder
```
**Solution:** Check segment timing, video file integrity

### Memory Issues
```
Error: Cannot allocate memory
```
**Solution:** Reduce concurrency in config:
```typescript
{
  encoderPreference: 'auto',
  concurrency: 2  // Lower from 6
}
```

---

## Benchmark Template

Use this to record results:

```
=== FinalVideoService Rebuild - Benchmark Results ===

Date: 2026-04-22
Project: 200conongdot (349 segments)
System: [Your GPU/CPU specs]

--- GPU Mode ---
Encoder: [h264_nvenc / h264_amf]
Time: [X minutes Y seconds]
Speed: [X segments/second]
Success: [Yes/No]
Issues: [None / List issues]

--- CPU Mode ---
Encoder: libx264
Time: [X minutes Y seconds]
Speed: [X segments/second]
Success: [Yes/No]
Issues: [None / List issues]

--- Auto Mode ---
Encoder: [Detected encoder]
Time: [X minutes Y seconds]
Speed: [X segments/second]
Success: [Yes/No]
Issues: [None / List issues]

--- Speedup ---
GPU vs CPU: [X.Xx faster]
Target achieved: [Yes/No - target is 5-10x]

--- Quality Check ---
Video/Audio Sync: [Perfect / X seconds drift]
Frozen Frames: [None / Count]
Playback: [Smooth / Issues]
File Size: [X MB]

--- Conclusion ---
[Your assessment]
```

---

## Next Steps After Testing

### If Tests Pass ✅
1. Document actual performance numbers
2. Update README with benchmark results
3. Deploy to production
4. Monitor user feedback

### If Tests Fail ❌
1. Collect error logs
2. Identify failure points
3. Debug specific modules
4. Re-run unit tests for failing components
5. Fix and re-test

---

## Notes

- **Unit tests (187)** verify module logic ✅
- **Real-world test** verifies Electron integration 🔄
- **Modules work correctly** in isolation ✅
- **Need app context** for FFmpeg paths, file operations

The rebuild is **code-complete** and **ready for integration testing** within the Electron app.

---

**Test Project:** `C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot`  
**Files:** original.mp4, dubbed/, transcript.srt ✅
