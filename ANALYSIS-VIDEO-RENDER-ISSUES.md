# Phân tích vấn đề Render Video - Frozen Frames & Trim Precision

**Ngày phân tích**: 2026-04-21  
**Vấn đề**: Video render ra bị frozen frames, không mượt mà  
**Nguồn**: ĐIỂM YẾU #5 trong ANALYSIS-WEAKNESSES.md

---

## 🔴 VẤN ĐỀ 1: TRIM FILTER - KEYFRAME SEEKING

### Root Cause

```typescript
// Code hiện tại (Line 728, 858):
let filterStr = `[0:v]trim=start=${start}:end=${end}`;
```

**Tại sao gây frozen frames:**

1. **FFmpeg trim filter không chính xác 100%**
   - `trim` filter hoạt động ở mức **stream level**
   - Khi `start` không phải keyframe → FFmpeg seek đến keyframe **GẦN NHẤT**
   - Có thể mất vài frames đầu/cuối mỗi segment

2. **Tích lũy lỗi với nhiều segments**
   - 349 segments × 2-3 frames mỗi segment = mất ~700-1000 frames
   - Gây ra frozen frames khi concat
   - Video không sync với audio

3. **Setpts không reset đúng**
   - Sau trim, PTS (Presentation Timestamp) không được reset về 0
   - Khi concat, PTS bị discontinuity → frozen frames

### Ví dụ cụ thể:

```
Segment 1: trim=start=0.0000:end=5.2340
- FFmpeg seek đến keyframe tại 0.0000 ✓
- Trim đến 5.2340, nhưng keyframe cuối ở 5.2000
- Mất 0.034s (1 frame ở 30fps)

Segment 2: trim=start=5.2340:end=10.5670
- FFmpeg seek đến keyframe tại 5.2667 (không phải 5.2340!)
- Mất 0.0327s đầu segment
- Khi concat với Segment 1 → gap → frozen frame

Segment 3, 4, 5... cứ thế tích lũy
→ 349 segments → frozen frames khắp nơi
```

---

## 🔴 VẤN ĐỀ 2: SETPTS KHÔNG RESET SAU TRIM

### Root Cause

```typescript
// Code hiện tại:
filterStr = `[0:v]trim=start=${start}:end=${end}`;
if (Math.abs(totalVideoSpeed - 1.0) > 0.001) {
    filterStr += `,setpts=${ptsMultiplier}*PTS`; // ❌ SAI!
} else {
    filterStr += `,setpts=PTS-STARTPTS`; // ✓ ĐÚNG
}
```

**Vấn đề:**
- Sau `trim`, PTS không được reset về 0
- Khi dùng `setpts=${ptsMultiplier}*PTS`, PTS vẫn giữ giá trị cũ
- Ví dụ: Segment 2 bắt đầu từ PTS=5.234s, không phải 0s
- Khi concat → PTS discontinuity → frozen frames

**Ví dụ:**
```
Segment 1: trim=0→5.234, setpts=0.8666*PTS
  → Output PTS: 0 → 4.536s ✓

Segment 2: trim=5.234→10.567, setpts=0.8666*PTS
  → Input PTS: 5.234 → 10.567
  → Output PTS: 4.536 → 9.158 (không bắt đầu từ 0!)
  → Khi concat với Segment 1 → PTS overlap → frozen frames ❌
```

---

## 🎯 GIẢI PHÁP

### Giải pháp 1: Thêm `setpts=PTS-STARTPTS` TRƯỚC khi scale

```typescript
// ĐÚNG:
filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
if (Math.abs(totalVideoSpeed - 1.0) > 0.001) {
    filterStr += `,setpts=${ptsMultiplier}*PTS`;
}
```

**Giải thích:**
1. `trim=start=${start}:end=${end}` - Cắt video
2. `setpts=PTS-STARTPTS` - Reset PTS về 0 (QUAN TRỌNG!)
3. `setpts=${ptsMultiplier}*PTS` - Scale tốc độ (nếu cần)

**Tại sao hoạt động:**
- `PTS-STARTPTS` reset PTS về 0 sau trim
- Mỗi segment bắt đầu từ PTS=0
- Khi concat → PTS liên tục → không frozen frames

### Giải pháp 2: Dùng `select` filter thay vì `trim` (Tốt hơn)

```typescript
// TỐT HƠN:
filterStr = `[0:v]select='between(t,${start},${end})',setpts=PTS-STARTPTS`;
if (Math.abs(totalVideoSpeed - 1.0) > 0.001) {
    filterStr += `,setpts=${ptsMultiplier}*PTS`;
}
```

**Ưu điểm:**
- `select` filter chính xác hơn `trim`
- Không bị keyframe seeking issue
- `setpts=PTS-STARTPTS` tự động reset PTS

### Giải pháp 3: Accurate seeking với `-ss` BEFORE `-i` (Tốt nhất cho batch)

```typescript
// TỐT NHẤT cho batch processing:
// Thay vì dùng trim filter, dùng -ss BEFORE -i
const batchEncodeArgs = [
    '-y',
    '-ss', start, // Accurate seek BEFORE input
    '-i', originalVideo,
    '-t', duration, // Duration instead of end time
    '-filter_complex', `[0:v]setpts=PTS-STARTPTS${speedFilter}[outv]`,
    '-map', '[outv]',
    ...HW_VIDEO_ARGS,
    batchOutputPath
];
```

**Ưu điểm:**
- `-ss` BEFORE `-i` → accurate seeking (không bị keyframe issue)
- Không cần trim filter
- Nhanh hơn (FFmpeg skip frames trước khi decode)

---

## 📊 SO SÁNH GIẢI PHÁP

| Giải pháp | Độ chính xác | Tốc độ | Độ phức tạp | Khuyến nghị |
|-----------|--------------|--------|-------------|-------------|
| **1. Thêm setpts=PTS-STARTPTS** | Trung bình | Nhanh | Thấp | ✓ Quick fix |
| **2. Dùng select filter** | Cao | Trung bình | Trung bình | ✓✓ Tốt |
| **3. -ss BEFORE -i** | Rất cao | Rất nhanh | Cao | ✓✓✓ Tốt nhất |

---

## 🔧 IMPLEMENTATION PLAN

### Priority 1: Quick Fix (5 phút)
Thêm `setpts=PTS-STARTPTS` sau trim:

```typescript
// Line 728 & 858:
let filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
```

### Priority 2: Better Fix (15 phút)
Dùng `select` filter:

```typescript
// Line 728 & 858:
let filterStr = `[0:v]select='between(t,${start},${end})',setpts=PTS-STARTPTS`;
```

### Priority 3: Best Fix (30 phút)
Refactor batch processing để dùng `-ss` BEFORE `-i`:
- Mỗi batch segment dùng `-ss` và `-t` thay vì trim filter
- Cần refactor loop logic

---

## 🧪 TESTING

### Test Case 1: Single segment với speed adjustment
```typescript
// Input: 10s video, speed=1.2x
// Expected: 8.33s output, smooth playback, no frozen frames
```

### Test Case 2: Multiple segments concat
```typescript
// Input: 3 segments (5s, 3s, 7s)
// Expected: 15s output, smooth transitions, no frozen frames at boundaries
```

### Test Case 3: 349 segments (Real world)
```typescript
// Input: 349 segments from 200conongdot project
// Expected: Smooth playback, no frozen frames, sync with audio
```

---

## 📝 CHECKLIST

- [ ] Implement Quick Fix: Add `setpts=PTS-STARTPTS` after trim
- [ ] Test với 3-5 segments
- [ ] Test với 349 segments (200conongdot)
- [ ] Verify no frozen frames
- [ ] Verify audio sync
- [ ] (Optional) Implement Better Fix: Use select filter
- [ ] (Optional) Implement Best Fix: Use -ss BEFORE -i

---

## 🎬 KẾT LUẬN

**Root cause của frozen frames:**
1. `trim` filter không chính xác (keyframe seeking)
2. `setpts` không được reset sau trim → PTS discontinuity

**Giải pháp nhanh nhất:**
Thêm `,setpts=PTS-STARTPTS` ngay sau `trim` filter để reset PTS về 0.

**Giải pháp tốt nhất:**
Dùng `-ss` BEFORE `-i` để accurate seeking, tránh trim filter hoàn toàn.
