# Checklist Kiểm Tra Render Video

## Trước khi render

- [ ] Project đã có video gốc trong `original/video/`
- [ ] Project đã có SRT trong `transcript/`
- [ ] Project đã có audio files trong `audio_gene/`
- [ ] Xóa folder `final/` cũ (nếu có) để test lại từ đầu

## Trong quá trình render

### 1. Kiểm tra Audio Processing Logs

Tìm các dòng log dạng:
```
[Audio] Segment N (type): videoDur=X.XXXs, targetDur=X.XXXs, actualDur=X.XXXs, drift=X.XXXs
```

**Kiểm tra:**
- [ ] `drift` của mỗi segment < 0.1s (chấp nhận được)
- [ ] `actualDur` ≈ `targetDur` (sai số nhỏ)
- [ ] Gap segments: `videoDur = targetDur` (không thay đổi)
- [ ] Dubbed segments: `targetDur` có thể khác `videoDur` (nếu audio dài)

### 2. Kiểm tra Video Processing Logs

Tìm các dòng log dạng:
```
[Video] Segment N [type]: trim=X→Xs, videoDur=X.XXXs, targetDur=X.XXXs, actualAudio=X.XXXs, videoSpeed=X.XXXX, adjustedSpeed=X.XXXX, totalSpeed=X.XXXX, setpts=X.XXXX*PTS
```

**Kiểm tra:**
- [ ] `adjustedSpeed` ≈ 1.0 (nếu không có drift lớn)
- [ ] `totalSpeed = videoSpeed × adjustedSpeed` (công thức đúng)
- [ ] `setpts = 1.0 / totalSpeed` (công thức đúng)
- [ ] Gap segments: `videoSpeed = 1.0`, `totalSpeed ≈ 1.0`
- [ ] Dubbed segments với audio dài: `videoSpeed > 1.0` (slow motion)

### 3. Ví dụ Log Đúng

**Gap segment (không thay đổi):**
```
[Audio] Segment 0 (gap): videoDur=2.500s, targetDur=2.500s, actualDur=2.501s, drift=0.001s
[Video] Segment 0 [gap]: trim=0.0000s→2.5000s, videoDur=2.500s, targetDur=2.500s, actualAudio=2.501s, videoSpeed=1.0000, adjustedSpeed=1.0004, totalSpeed=1.0004, setpts=0.9996*PTS
```
✅ Drift nhỏ, totalSpeed ≈ 1.0

**Dubbed segment (audio dài):**
```
[Audio] Segment 1 (dubbed): videoDur=10.000s, targetDur=11.538s, actualDur=11.540s, drift=0.002s
[Video] Segment 1 [dubbed]: trim=2.5000s→12.5000s, videoDur=10.000s, targetDur=11.538s, actualAudio=11.540s, videoSpeed=1.1538, adjustedSpeed=1.0002, totalSpeed=1.1540, setpts=0.8666*PTS
```
✅ videoSpeed > 1.0 (làm chậm video), adjustedSpeed ≈ 1.0, totalSpeed = 1.1538 × 1.0002

**Dubbed segment (audio ngắn):**
```
[Audio] Segment 2 (dubbed): videoDur=8.000s, targetDur=8.000s, actualDur=8.001s, drift=0.001s
[Video] Segment 2 [dubbed]: trim=12.5000s→20.5000s, videoDur=8.000s, targetDur=8.000s, actualAudio=8.001s, videoSpeed=1.0000, adjustedSpeed=1.0001, totalSpeed=1.0001, setpts=0.9999*PTS
```
✅ Audio ngắn hơn video → giữ nguyên, pad silence

## Sau khi render

### 4. Kiểm tra Output Video

- [ ] File `final/final_video.mp4` được tạo thành công
- [ ] Kích thước file hợp lý (không quá nhỏ hoặc quá lớn)
- [ ] Mở video và kiểm tra:
  - [ ] Video chạy mượt mà, không bị frozen frames
  - [ ] Audio và video sync từ đầu đến cuối
  - [ ] Không có đoạn nào bị dãn ra hoặc nén lại bất thường
  - [ ] Chất lượng hình ảnh tốt
  - [ ] Âm thanh rõ ràng, không bị méo

### 5. Kiểm tra Timeline

- [ ] Tổng thời lượng video = tổng thời lượng audio
- [ ] Mỗi segment có độ dài đúng với `actualAudio`
- [ ] Không có khoảng trống hoặc overlap giữa các segments

## Nếu có lỗi

### Lỗi: Video bị frozen frames

**Nguyên nhân có thể:**
- `totalSpeed` tính sai → Kiểm tra công thức
- `setpts` không đúng → Kiểm tra log

**Cách fix:**
- Xem lại log của segment bị lỗi
- Kiểm tra `videoSpeed`, `adjustedSpeed`, `totalSpeed`

### Lỗi: Audio không sync với video

**Nguyên nhân có thể:**
- Drift tích lũy quá lớn
- `actualDur` khác `targetDur` quá nhiều

**Cách fix:**
- Kiểm tra drift của từng segment
- Xem log `[Sync] Cumulative drift at segment N`

### Lỗi: Video bị dãn ra

**Nguyên nhân:**
- `totalSpeed` quá lớn (> 1.5)
- Audio quá dài so với video gốc

**Cách fix:**
- Kiểm tra `MAX_AUDIO_SPEEDUP` (hiện tại = 1.3)
- Có thể tăng lên 1.5 nếu cần

## Ghi chú

- Tất cả logs được in ra console của Electron DevTools
- Mở DevTools: View → Toggle Developer Tools
- Filter logs: Gõ `[Audio]` hoặc `[Video]` trong console filter
