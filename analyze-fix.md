# FinalVideoService Fix Analysis

## Ngày: 2026-04-21

## Vấn đề ban đầu
Video final bị render sai: chỉ có đoạn đầu và đoạn sau, phần giữa bị dãn ra (frozen frames) mặc dù đầy đủ thời gian.

## Nguyên nhân
**Logic sai tại dòng 703** trong `FinalVideoService.ts`:

```javascript
// SAI:
const adjustedSpeed = actualSegmentDuration / seg.videoDuration;
```

### Tại sao sai?

1. **buildSegmentMap** đã tính toán `videoSpeed` và `targetDuration`:
   - Ví dụ: Video 10s, Audio 15s
   - → `videoSpeed = 1.154` (cần làm chậm video)
   - → `targetDuration = 11.54s`

2. **Khi render video**, code cũ tính:
   - `adjustedSpeed = 11.54 / 10 = 1.154`
   - Nhưng `videoSpeed` đã là 1.154 rồi!
   - → Video bị áp dụng slow motion **2 lần**!

3. **Kết quả**: 
   - Các segment dubbed (có audio dài) bị kéo dài quá mức
   - Video bị "dãn" ra, tạo frozen frames
   - Timeline không khớp với audio

## Giải pháp

### Fix 1: So sánh với targetDuration thay vì videoDuration

```javascript
// ĐÚNG:
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
```

**Lý do**: `targetDuration` đã tính toán sẵn thời lượng mong đợi sau khi áp dụng `videoSpeed`.

### Fix 2: Tính totalVideoSpeed

```javascript
const totalVideoSpeed = seg.videoSpeed * adjustedSpeed;
const ptsMultiplier = 1.0 / totalVideoSpeed;
```

**Lý do**: Cần kết hợp cả:
- `videoSpeed` từ buildSegmentMap (điều chỉnh cho audio dài/ngắn)
- `adjustedSpeed` (điều chỉnh drift giữa actual vs target)

## Ví dụ minh họa

### Trước khi fix:
```
Segment 5 (dubbed):
  videoDuration = 10.0s
  audioDuration = 15.0s
  → videoSpeed = 1.154 (từ buildSegmentMap)
  → targetDuration = 11.54s
  
  actualAudioDuration = 11.55s (sau xử lý)
  
  // SAI:
  adjustedSpeed = 11.55 / 10.0 = 1.155
  setpts = 1/1.155 = 0.8658*PTS
  
  → Video bị slow motion 1.155x
  → Nhưng đã có videoSpeed=1.154 rồi!
  → Tổng cộng: 1.154 × 1.155 = 1.333x (SAI!)
```

### Sau khi fix:
```
Segment 5 (dubbed):
  videoDuration = 10.0s
  targetDuration = 11.54s
  videoSpeed = 1.154
  
  actualAudioDuration = 11.55s
  
  // ĐÚNG:
  adjustedSpeed = 11.55 / 11.54 = 1.0009
  totalVideoSpeed = 1.154 × 1.0009 = 1.155
  setpts = 1/1.155 = 0.8658*PTS
  
  → Video chạy đúng tốc độ!
```

## Các file đã sửa

1. **FinalVideoService.ts** (dòng 701-715):
   - Đổi `actualSegmentDuration / seg.videoDuration` → `actualSegmentDuration / seg.targetDuration`
   - Thêm `totalVideoSpeed = seg.videoSpeed * adjustedSpeed`
   - Cập nhật logging để hiển thị đầy đủ thông tin

## Logging mới

```
[Audio] Segment N (type): videoDur=X.XXXs, targetDur=X.XXXs, actualDur=X.XXXs, drift=X.XXXs
[Video] Segment N [type]: trim=X→Xs, videoDur=X.XXXs, targetDur=X.XXXs, actualAudio=X.XXXs, videoSpeed=X.XXXX, adjustedSpeed=X.XXXX, totalSpeed=X.XXXX, setpts=X.XXXX*PTS
```

## Cách kiểm tra

1. Chạy app: `npm start`
2. Load project: `C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot`
3. Click "Render Final Video"
4. Kiểm tra console logs:
   - `adjustedSpeed` nên ≈ 1.0 (drift nhỏ)
   - `totalSpeed` = `videoSpeed × adjustedSpeed`
   - `setpts` = `1.0 / totalSpeed`

## Kết quả mong đợi

- ✅ Video không bị frozen frames
- ✅ Audio và video sync hoàn hảo
- ✅ Tất cả segments có độ dài chính xác
- ✅ Timeline khớp với audio từ đầu đến cuối

## Unit Tests

Tất cả 39 tests pass:
- FinalVideoService.videostretch.test.ts ✅
- FinalVideoService.fade.test.ts ✅
- FinalVideoService.sync.test.ts ✅
- FinalVideoService.race.test.ts ✅
