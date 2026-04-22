# Solution 3 Implementation - Remove adjustedSpeed Logic

**Ngày**: 2026-04-21 16:57 UTC  
**Solution**: Remove adjustedSpeed logic  
**Status**: ✅ IMPLEMENTED

---

## 🎯 PROBLEM IDENTIFIED

Sau khi test với project 200conongdot (193 segments):
- ✅ Batch processing hoạt động (12 batches)
- ✅ Video được render thành công
- ❌ **Frozen frames vẫn còn**

**Root Cause**: `adjustedSpeed` logic gây confusion và có thể tạo ra video speed không đúng.

---

## 🔧 SOLUTION IMPLEMENTED

### Thay đổi logic video speed calculation:

**BEFORE (SAI)**:
```typescript
const actualSegmentDuration = actualDurations[globalIdx]; // Audio duration
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
const clampedAdjustedSpeed = Math.max(0.5, Math.min(2.0, adjustedSpeed));
const totalVideoSpeed = seg.videoSpeed * clampedAdjustedSpeed;
```

**Vấn đề**:
- `actualSegmentDuration` là **audio duration** (sau khi process)
- Dùng audio duration để adjust video speed → SAI LOGIC
- Video speed không nên phụ thuộc vào audio drift
- Gây ra frozen frames hoặc video bị stretch sai

**AFTER (ĐÚNG)**:
```typescript
// Use ONLY seg.videoSpeed from buildSegmentMap
const totalVideoSpeed = seg.videoSpeed;
```

**Lý do**:
- `seg.videoSpeed` đã được tính toán đúng trong `buildSegmentMap()`
- Dựa trên audio/video duration ratio
- Không nên adjust thêm dựa trên audio drift
- Video speed chỉ phụ thuộc vào original calculation

---

## 📝 FILES MODIFIED

### File: `src/services/FinalVideoService.ts`

#### Change 1: Batch Processing Path (Line 765-794)

**Removed**:
```typescript
const actualSegmentDuration = actualDurations[globalIdx];
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
const clampedAdjustedSpeed = Math.max(0.5, Math.min(2.0, adjustedSpeed));
const totalVideoSpeed = seg.videoSpeed * clampedAdjustedSpeed;
```

**Added**:
```typescript
// FIX FROZEN FRAMES: Remove adjustedSpeed logic
// Only use seg.videoSpeed from buildSegmentMap
const totalVideoSpeed = seg.videoSpeed;

if (Math.abs(totalVideoSpeed - 1.0) > 0.001) {
    const ptsMultiplier = (1.0 / totalVideoSpeed).toFixed(4);
    filterStr += `,setpts=${ptsMultiplier}*PTS`;
    console.log(`[VideoFilter] Batch segment ${globalIdx}: videoSpeed=${totalVideoSpeed.toFixed(4)}, setpts=${ptsMultiplier}*PTS`);
}
```

#### Change 2: Single-Pass Path (Line 895-930)

**Removed**:
```typescript
const actualSegmentDuration = actualDurations[i];
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
const clampedAdjustedSpeed = Math.max(0.5, Math.min(2.0, adjustedSpeed));
const totalVideoSpeed = seg.videoSpeed * clampedAdjustedSpeed;
```

**Added**:
```typescript
// FIX FROZEN FRAMES: Remove adjustedSpeed logic
// Only use seg.videoSpeed from buildSegmentMap
const totalVideoSpeed = seg.videoSpeed;

if (Math.abs(totalVideoSpeed - 1.0) > 0.001) {
    const ptsMultiplier = (1.0 / totalVideoSpeed).toFixed(4);
    filterStr += `,setpts=${ptsMultiplier}*PTS`;
    console.log(`[Video] Segment ${i} [${seg.type}]: videoSpeed=${totalVideoSpeed.toFixed(4)}, setpts=${ptsMultiplier}*PTS`);
}
```

---

## 🔍 LOGIC EXPLANATION

### buildSegmentMap() calculation (CORRECT):

```typescript
if (audioDuration > 0) {
    const ratio = audioDuration / originalDuration;
    if (ratio > MAX_AUDIO_SPEEDUP) {
        // Audio quá dài → slow down video
        audioSpeed = MAX_AUDIO_SPEEDUP;
        targetDuration = audioDuration / MAX_AUDIO_SPEEDUP;
        videoSpeed = targetDuration / originalDuration; // > 1.0 = slow motion
    } else if (ratio > 1.0) {
        // Audio dài hơn → speed up audio, keep video normal
        audioSpeed = ratio;
        targetDuration = originalDuration;
        videoSpeed = 1.0;
    } else {
        // Audio ngắn hơn → pad silence, keep video normal
        audioSpeed = 1.0;
        targetDuration = originalDuration;
        videoSpeed = 1.0;
    }
}
```

**Key point**: `videoSpeed` đã được tính toán dựa trên:
- `audioDuration` (TTS output)
- `originalDuration` (SRT timing)
- Logic đúng để sync audio/video

### Video filter generation (NOW CORRECT):

```typescript
const totalVideoSpeed = seg.videoSpeed; // Chỉ dùng giá trị từ buildSegmentMap

if (totalVideoSpeed !== 1.0) {
    // Apply slow motion hoặc speed up
    const ptsMultiplier = 1.0 / totalVideoSpeed;
    filterStr += `,setpts=${ptsMultiplier}*PTS`;
}
```

**Result**:
- Video speed chính xác theo calculation từ buildSegmentMap
- Không bị ảnh hưởng bởi audio drift
- Không có confusion logic

---

## ✅ EXPECTED RESULTS

### Before (với adjustedSpeed):
```
Segment 1: videoSpeed=1.2, actualAudio=5.8s, targetDuration=5.2s
  → adjustedSpeed = 5.8/5.2 = 1.115
  → totalVideoSpeed = 1.2 × 1.115 = 1.338
  → setpts = 0.747*PTS (SAI! Quá chậm)
```

### After (without adjustedSpeed):
```
Segment 1: videoSpeed=1.2
  → totalVideoSpeed = 1.2
  → setpts = 0.833*PTS (ĐÚNG!)
```

---

## 🧪 TESTING INSTRUCTIONS

### Step 1: Clean temp files
```bash
# Delete temp_final directory
rm -rf "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final"
```

### Step 2: Run final video generation
1. Open app
2. Load project 200conongdot
3. Click "Tạo Video Cuối Cùng"
4. Monitor console log

### Step 3: Check console output
```
[VideoFilter] Batch segment 0: videoSpeed=1.0000, setpts=1.0000*PTS
[VideoFilter] Batch segment 5: videoSpeed=1.2000, setpts=0.8333*PTS
[VideoFilter] Batch segment 12: videoSpeed=1.0000, setpts=1.0000*PTS
...
```

### Step 4: Verify output video
- [ ] Play video từ đầu đến cuối
- [ ] Check frozen frames (should be NONE)
- [ ] Check audio sync (should be PERFECT)
- [ ] Check video smoothness (should be SMOOTH)

---

## 📊 COMPARISON

| Aspect | Before (adjustedSpeed) | After (no adjustedSpeed) |
|--------|------------------------|--------------------------|
| **Logic** | Complex, confusing | Simple, clear |
| **Video Speed** | Depends on audio drift | Depends on buildSegmentMap only |
| **Frozen Frames** | ❌ Yes | ✅ Should be fixed |
| **Audio Sync** | ❓ May drift | ✅ Should be good |

---

## 🎯 IF STILL FROZEN FRAMES

Nếu sau khi test vẫn còn frozen frames:

### Next Step: Implement Solution 1 (SELECT filter)

Replace `trim` filter với `select` filter:

```typescript
// BEFORE:
filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;

// AFTER:
filterStr = `[0:v]select='between(t,${start},${end})',setpts=PTS-STARTPTS`;
```

**Reason**: `select` filter chính xác hơn `trim` (frame-level vs stream-level)

---

## ✅ VERIFICATION

- ✅ TypeScript compilation: No errors
- ✅ adjustedSpeed logic removed from both paths
- ✅ Simplified video speed calculation
- ✅ Added logging for debugging
- ✅ Ready for testing

---

**Status**: ✅ READY FOR TESTING  
**Next**: Test với 200conongdot và verify frozen frames đã fix
