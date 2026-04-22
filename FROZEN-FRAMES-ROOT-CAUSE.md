# Phân Tích Vấn đề Frozen Frames - Root Cause Analysis

**Ngày**: 2026-04-21 16:55 UTC  
**Project**: 200conongdot  
**Segments**: 193 (không phải 349)  
**Status**: ❌ Frozen frames vẫn còn sau khi fix PTS reset

---

## 🔍 FINDINGS TỪ TEST

### Test Results:
- ✅ Batch processing hoạt động: 12 batches được tạo
- ✅ Video được render thành công: final_video.mp4 (133MB)
- ✅ Audio được concat: final_mixed_audio.wav (141MB)
- ❌ **Frozen frames vẫn còn trong output video**

### Files Created:
```
temp_final/
  - audio_seg_0000.wav ... audio_seg_0192.wav (193 segments)
  - final_mixed_audio.wav (141MB)
  - merged_video.mp4(113MB)
  - batch_concat_list.txt (12 batches)
  
final/
  - final_video.mp4 (133MB)
```

---

## 🐛 ROOT CAUSE HYPOTHESIS

Fix PTS reset (`setpts=PTS-STARTPTS` sau trim) **KHÔNG ĐỦ** để giải quyết frozen frames.

### Tại sao?

**Vấn đề thực sự không phải ở PTS discontinuity, mà ở:**

## ❌ HYPOTHESIS #1: TRIM FILTER KEYFRAME ISSUE

**Vấn đề**:
```typescript
filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
```

FFmpeg `trim` filter hoạt động ở **stream level**, không phải **frame level**:
- Khi `start` không phải keyframe → FFmpeg seek đến keyframe **GẦN NHẤT**
- Có thể skip hoặc duplicate frames
- 193 segments × 2-3 frames mỗi segment = ~400-600 frames bị mất/duplicate
- → Frozen frames khi concat

**Evidence**:
- Frozen frames xảy ra ở segment boundaries
- Video không mượt mặc dù PTS đã reset

**Solution**: Dùng `select` filter thay vì `trim`

---

## ❌ HYPOTHESIS #2: VIDEO SPEED ADJUSTMENT SAI

**Vấn đề**:
```typescript
// Line 739-741
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
const clampedAdjustedSpeed = Math.max(0.5, Math.min(2.0, adjustedSpeed));
const totalVideoSpeed = seg.videoSpeed * clampedAdjustedSpeed;

// Line 745
filterStr += `,setpts=${ptsMultiplier}*PTS`;
```

**Vấn đề logic**:
1. `actualSegmentDuration` là audio duration (sau khi process)
2. `seg.targetDuration` là expected audio duration
3. `adjustedSpeed` = actual / target → để compensate audio drift
4. `totalVideoSpeed` = seg.videoSpeed × adjustedSpeed

**Nhưng**:
- Nếu audio drift tích lũy → `adjustedSpeed` sai
- Nếu `totalVideoSpeed` sai → video bị stretch/compress sai
- → Frozen frames hoặc fast forward

**Evidence cần kiểm tra**:
- Log `adjustedSpeed` values
- Log `totalVideoSpeed` values
- Check có segments nào có extreme values không

---

## ❌ HYPOTHESIS #3: BATCH VIDEO LENGTH MISMATCH

**Vấn đề**:
Mỗi batch video có length khác nhau:
- Batch 1: 30 segments → X seconds
- Batch 2: 30 segments → Y seconds
- ...
- Batch 12: 13 segments → Z seconds

Khi concat batches:
```
batch_video_000.mp4 (length: X)
batch_video_001.mp4 (length: Y)
...
```

Nếu X, Y, Z không match với expected audio length → discontinuity

**Evidence cần kiểm tra**:
- Duration của mỗi batch video
- So sánh với expected duration từ segments

---

## ❌ HYPOTHESIS #4: FPS FILTER TIMING ISSUE

**Vấn đề**:
```typescript
filterStr += `,fps=${fps.toFixed(3)}[${vLabel}]`;
```

`fps` filter có thể:
- Drop frames nếu input fps > output fps
- Duplicate frames nếu input fps < output fps
- Không sync với `setpts` adjustment

**Evidence**:
- Frozen frames có thể là duplicated frames từ fps filter
- Không phải PTS issue

---

## 🎯 GIẢI PHÁP ĐỀ XUẤT

### Solution 1: Dùng SELECT filter thay vì TRIM (RECOMMENDED)

**Thay đổi**:
```typescript
// BEFORE (SAI):
filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;

// AFTER (ĐÚNG):
filterStr = `[0:v]select='between(t,${start},${end})',setpts=PTS-STARTPTS`;
```

**Ưu điểm**:
- `select` filter chính xác hơn `trim`
- Không bị keyframe seeking issue
- Frame-level precision

**Nhược điểm**:
- Có thể chậm hơn `trim` một chút

---

### Solution 2: Dùng -ss BEFORE -i (BEST)

**Thay đổi cách encode batch**:
```typescript
// BEFORE: Dùng trim filter trong filter_complex
const batchEncodeArgs = [
    '-y',
    '-i', originalVideo,
    '-filter_complex_script', batchFilterScriptPath,
    ...
];

// AFTER: Dùng -ss BEFORE -i cho accurate seeking
// Encode từng segment riêng, sau đó concat
for each segment in batch:
    const segmentArgs = [
        '-y',
        '-ss', seg.videoStart,  // Accurate seek BEFORE input
        '-i', originalVideo,
        '-t', seg.videoDuration, // Duration
        '-filter_complex', `[0:v]setpts=PTS-STARTPTS${speedFilter}[outv]`,
        '-map', '[outv]',
        ...HW_VIDEO_ARGS,
        segment_video.mp4
    ];
    
// Then concat all segments
```

**Ưu điểm**:
- `-ss` BEFORE `-i` → accurate seeking (không bị keyframe issue)
- Không cần trim filter
- Nhanh hơn (FFmpeg skip frames trước khi decode)

**Nhược điểm**:
- Phức tạp hơn (cần encode từng segment riêng)
- Nhiều file hơn

---

### Solution 3: Loại bỏ adjustedSpeed logic (SIMPLE)

**Vấn đề**: `adjustedSpeed` có thể gây confusion

**Thay đổi**:
```typescript
// BEFORE:
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
const totalVideoSpeed = seg.videoSpeed * adjustedSpeed;

// AFTER: Chỉ dùng seg.videoSpeed
const totalVideoSpeed = seg.videoSpeed;
```

**Lý do**:
- `actualSegmentDuration` là audio duration (không liên quan đến video)
- Video speed chỉ nên dựa trên `seg.videoSpeed` từ buildSegmentMap
- Không nên adjust dựa trên audio drift

**Ưu điểm**:
- Logic đơn giản hơn
- Ít confusion hơn

**Nhược điểm**:
- Có thể có drift nhỏ giữa video và audio

---

## 🧪 TESTING PLAN

### Test 1: Implement Solution 1 (SELECT filter)

1. Replace `trim` với `select` trong cả batch và single-pass
2. Test với 200conongdot
3. Check frozen frames

### Test 2: Implement Solution 3 (Remove adjustedSpeed)

1. Loại bỏ `adjustedSpeed` logic
2. Chỉ dùng `seg.videoSpeed`
3. Test với 200conongdot
4. Check frozen frames và audio sync

### Test 3: Implement Solution 2 (-ss BEFORE -i)

1. Refactor batch processing để encode từng segment riêng
2. Dùng `-ss` BEFORE `-i`
3. Test với 200conongdot
4. Check frozen frames

---

## 📊 PRIORITY

1. **Solution 3** (Remove adjustedSpeed) - QUICK FIX, 5 phút
2. **Solution 1** (SELECT filter) - MEDIUM FIX, 10 phút
3. **Solution 2** (-ss BEFORE -i) - BEST FIX, 30 phút

---

## 🎯 RECOMMENDATION

**Implement Solution 3 FIRST** (remove adjustedSpeed logic):
- Nhanh nhất
- Đơn giản nhất
- Có thể fix được vấn đề

**Nếu Solution 3 không fix**:
→ Implement Solution 1 (SELECT filter)

**Nếu Solution 1 vẫn không fix**:
→ Implement Solution 2 (-ss BEFORE -i)

---

**Next Step**: Implement Solution 3 và test ngay
