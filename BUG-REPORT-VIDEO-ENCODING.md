# Bug Report: Video Encoding Failures (339/349 segments)

**Date:** 2026-04-22  
**Status:** 🔍 **PARTIALLY FIXED** - Need root cause investigation  
**Severity:** HIGH

---

## Issue Summary

Video rendering failed for 200conongdot project with 339 out of 349 segments producing corrupted files (261 bytes each).

### Symptoms
- ✅ Segments 0-9: Successfully encoded (800KB - 14MB)
- ❌ Segments 10-348: Failed - all 261 bytes (empty MP4 header only)
- ✅ Audio processing: Completed successfully (141MB)
- ❌ Video concatenation: Never ran (no merged_video.mp4)

---

## Root Cause Analysis (Phase 1)

### Primary Issue: Promise.all() Fail-Fast Behavior ✅ FIXED

**Problem:**
```typescript
// OLD CODE (line 74)
const results = await Promise.all(encodePromises);
```

When segment 10 failed, `Promise.all()` rejected immediately, stopping all remaining segments from encoding.

**Fix Applied:**
```typescript
// NEW CODE
const encodePromises = segments.map((segment, index) =>
  limit(async () => {
    try {
      const result = await this.encodeSegmentWithRetry(...);
      return { success: true, path: result.outputPath, index };
    } catch (error) {
      console.error(`Segment ${index} failed permanently:`, error);
      return { success: false, path: null, index, error: error.message };
    }
  })
);

const results = await Promise.all(encodePromises);

// Check for failures and report
const failures = results.filter(r => !r.success);
if (failures.length > 0) {
  throw new Error(`Failed to encode ${failures.length} segments`);
}
```

**Commit:** `d9147d3` - "fix: handle segment encoding failures gracefully"

---

## Secondary Issue: Why Did Segment 10 Fail? 🔍 NEEDS INVESTIGATION

The fix allows all segments to process, but we still need to find why segment 10 (and potentially others) failed.

### Possible Causes

1. **Video Timing Issue**
   - Segment may exceed video duration
   - Invalid startTime/duration values
   - Check: `segment.videoStart + segment.videoDuration > videoDuration`

2. **FFmpeg Command Error**
   - GPU encoder command malformed
   - Invalid parameters for specific segment
   - Check FFmpeg stderr output

3. **GPU Encoder Issue**
   - GPU memory exhausted after 10 segments
   - Driver issue
   - GPU encoder not properly initialized

4. **Concurrency Overload**
   - 6 concurrent GPU encodes too high
   - System resources exhausted
   - Memory pressure

---

## Diagnostic Steps

### 1. Check Console Logs

With the new logging added, run the app and look for:

```
[VideoProcessor] Encoding segment 10: {
  startTime: X.XX,
  duration: X.XX,
  speed: X.XX,
  encoder: 'h264_nvenc' or 'h264_amf'
}
```

Then look for error messages:
```
Segment 10 encode attempt 1/3 failed: [ERROR MESSAGE]
Segment 10: Falling back to CPU encoder
Segment 10 failed permanently: [FINAL ERROR]
```

### 2. Check Segment Timing

Run this to check if segment 10 exceeds video bounds:

```typescript
// In FinalVideoService or debug script
const originalVideo = 'path/to/original.mp4';
const videoDuration = await getMediaDuration(originalVideo);

console.log('Video duration:', videoDuration);
console.log('Segment 10:', {
  start: validatedSegments[10].videoStart,
  duration: validatedSegments[10].videoDuration,
  end: validatedSegments[10].videoStart + validatedSegments[10].videoDuration,
  exceedsVideo: (validatedSegments[10].videoStart + validatedSegments[10].videoDuration) > videoDuration
});
```

### 3. Test Single Segment Encoding

Create a test to encode segment 10 in isolation:

```typescript
const encoder = await encoderFactory.createEncoder();
const result = await encoder.encodeSegment(
  originalVideo,
  'test_segment_10.mp4',
  {
    startTime: validatedSegments[10].videoStart,
    duration: validatedSegments[10].videoDuration,
    videoSpeed: validatedSegments[10].adjustedVideoSpeed,
    fps: 30,
    crf: 23,
    preset: 'medium'
  }
);

console.log('Result:', result);
```

### 4. Reduce Concurrency

Try with lower concurrency to rule out resource exhaustion:

```typescript
// In FinalVideoService config
{
  encoderPreference: 'auto',
  concurrency: 2  // Reduce from 6
}
```

---

## Next Steps

1. **Run app with new logging** - Capture actual error messages
2. **Check segment 10 timing** - Verify it's within video bounds
3. **Test with CPU encoder** - Rule out GPU-specific issues
4. **Test with concurrency=1** - Rule out parallel processing issues
5. **Share error logs** - Post actual FFmpeg error messages

---

## Expected Behavior After Fix

With the fix applied:
- ✅ All 349 segments will attempt to encode
- ✅ Failed segments will be logged with error messages
- ✅ Process will continue even if some segments fail
- ✅ Final error will list all failed segments
- ❌ Video will still fail if ANY segment fails (by design)

But now we'll have **detailed error logs** showing exactly why segments fail.

---

## Testing Instructions

1. **Clean temp folder:**
   ```bash
   Remove-Item "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final" -Recurse -Force
   ```

2. **Run app:**
   ```bash
   npm run dev
   ```

3. **Load project and generate video**

4. **Monitor console for:**
   - `[VideoProcessor] Encoding segment X:` messages
   - Error messages for failed segments
   - Final summary of failures

5. **Share logs** with error messages

---

## Files Changed

- `src/services/video/VideoProcessor.ts`
  - Added try-catch in parallel processing
  - Added detailed error logging
  - Added failure summary reporting
  - Changed from fail-fast to fail-with-report

---

## Status

- ✅ **Immediate issue fixed**: Process no longer stops at first failure
- 🔍 **Root cause pending**: Need to investigate why segments fail
- 📊 **Tests passing**: 187/187 tests pass
- 🚀 **Ready for testing**: Run app to gather error logs

---

**Next:** Run the app and share the console error messages to identify root cause of segment encoding failures.
