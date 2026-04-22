# Debug Analysis - Batch 1 Failure

**Ngày**: 2026-04-22 09:10 UTC  
**Issue**: Batch 1 vẫn fail (262 bytes) mặc dù đã dùng CPU encoder

---

## 🔍 FINDINGS

### Batch Results:
```
batch_video_000.mp4: 203,746,180 bytes (~203MB) ✓ SUCCESS
batch_video_001.mp4:        262 bytes ❌ FAIL
```

### Filter Script Analysis (batch_1):
```
[0:v]trim=start=20.7370:end=20.9170,setpts=PTS-STARTPTS,fps=30.000[v0];
[0:v]trim=start=20.9170:end=27.7400,setpts=PTS-STARTPTS,fps=30.000[v1];
[0:v]trim=start=27.7400:end=28.0000,setpts=PTS-STARTPTS,fps=30.000[v2];
[0:v]trim=start=28.0000:end=29.0000,setpts=PTS-STARTPTS,setpts=0.4947*PTS,fps=30.000[v3]; ← EXTREME SLOW MOTION
[0:v]trim=start=29.0000:end=34.5980,setpts=PTS-STARTPTS,fps=30.000[v4];
[0:v]trim=start=35.5980:end=35.5980,setpts=PTS-STARTPTS,setpts=0.5405*PTS,fps=30.000[v5]; ← EXTREME SLOW MOTION
...
concat=n=10:v=1:a=0,format=yuv420p[outv]
```

---

## 🐛 POTENTIAL ISSUES

### Issue #1: Extreme Slow Motion Values

**setpts=0.4947*PTS** nghĩa là:
- Video chạy ở 49.47% tốc độ bình thường
- 1 giây video → 2.02 giây output
- **Extreme slow motion**

**setpts=0.5405*PTS** nghĩa là:
- Video chạy ở 54.05% tốc độ bình thường  
- 1 giây video → 1.85 giây output

**Vấn đề**: Các giá trị này có thể gây:
- FFmpeg timeout
- Memory issues
- Encoding failure

### Issue #2: Very Short Segments

**Segment v0**: trim=20.7370:end=20.9170
- Duration: 0.18 giây (180ms)
- **Quá ngắn!**

**Segment v2**: trim=27.7400:end=28.0000
- Duration: 0.26 giây (260ms)
- **Quá ngắn!**

**Vấn đề**: Segments quá ngắn có thể:
- Không có keyframes
- Trim fail
- Encoding fail

### Issue #3: Trim Filter Keyframe Issue

**trim filter** không chính xác với non-keyframe positions:
- `trim=start=20.7370` có thể không có keyframe tại 20.737s
- FFmpeg seek đến keyframe gần nhất
- Có thể skip hoặc fail

---

## 🎯 ROOT CAUSE HYPOTHESIS

**Batch 0 success vì**:
- Bắt đầu từ 0s (có keyframe)
- Segments dài hơn
- Ít extreme slow motion

**Batch 1 fail vì**:
- Bắt đầu từ 20.737s (có thể không có keyframe)
- Có segments rất ngắn (180ms)
- Có extreme slow motion (0.4947x, 0.5405x)

---

## 🔧 SOLUTIONS

### Solution 1: Use SELECT filter instead of TRIM (RECOMMENDED)

**Replace trim với select**:
```typescript
// BEFORE:
filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;

// AFTER:
filterStr = `[0:v]select='between(t,${start},${end})',setpts=PTS-STARTPTS`;
```

**Reason**:
- `select` filter works at frame level (more accurate)
- `trim` filter works at stream level (keyframe dependent)
- `select` doesn't have keyframe seeking issues

### Solution 2: Use -ss BEFORE -i (BEST but complex)

**Change encoding approach**:
```typescript
// Instead of using filter_complex for trim
// Use -ss BEFORE -i for accurate seeking

for each segment in batch:
    ffmpeg -ss ${seg.videoStart} -i originalVideo -t ${seg.videoDuration} ...
    
// Then concat all segment videos
```

**Reason**:
- `-ss` before `-i` = accurate seeking
- No keyframe issues
- Faster (FFmpeg skips frames before decode)

### Solution 3: Skip very short segments

**Add validation**:
```typescript
if (seg.videoDuration < 0.5) {
    console.warn(`[Batch] Skipping very short segment ${globalIdx}: ${seg.videoDuration}s`);
    continue;
}
```

**Reason**:
- Segments < 0.5s often problematic
- May not have keyframes
- May cause encoding issues

---

## 📝 RECOMMENDED FIX

**Implement Solution 1 (SELECT filter)** - Quickest fix:

### Change in FinalVideoService.ts (Line 772):

```typescript
// BEFORE:
let filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;

// AFTER:
let filterStr = `[0:v]select='between(t,${start},${end})',setpts=PTS-STARTPTS`;
```

**Apply to both**:
- Batch processing path (Line 772)
- Single-pass path (Line 901)

---

## ⚠️ WHY SELECT IS BETTER

| Feature | trim | select |
|---------|------|--------|
| **Precision** | Stream-level | Frame-level |
| **Keyframe** | Dependent | Independent |
| **Short segments** | May fail | Works |
| **Accuracy** | ±few frames | Exact |

---

## 🧪 TESTING

After implementing SELECT filter:
1. Clean temp_final
2. Run final video generation
3. Check batch 1 encodes successfully
4. Verify all 20 batches work

---

**Status**: 🔴 BATCH 1 FAILS - Need SELECT filter  
**Next**: Implement SELECT filter fix  
**ETA**: 5 phút
