# Hướng dẫn Render Video Test

## Bước 1: Chạy Electron App

### Cách 1: Dùng script tự động
```bash
run-render-test.bat
```

### Cách 2: Chạy thủ công
```bash
cd C:\Users\tranm.DESKTOP-8VO69Q5\Documents\project_code\auto-voice-over
npm start
```

---

## Bước 2: Load Project

1. App sẽ mở tự động
2. Chọn project: `C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot`
3. Đợi app load xong

---

## Bước 3: Mở DevTools (QUAN TRỌNG!)

**Trước khi render**, mở DevTools để xem logs:
- Menu: `View` → `Toggle Developer Tools`
- Hoặc phím tắt: `Ctrl + Shift + I`

---

## Bước 4: Render Video

1. Click nút **"Render Final Video"** hoặc **"Tạo Video Cuối"**
2. Chờ render hoàn tất (~2-3 phút)
3. Theo dõi logs trong DevTools Console

---

## Bước 5: Kiểm tra Logs

### Logs cần chú ý:

#### 1. Audio Processing Logs
```
[Audio] Segment 0 (gap): videoDur=0.511s, targetDur=0.511s, actualDur=0.512s, drift=0.001s
[Audio] Segment 1 (dubbed): videoDur=3.521s, targetDur=3.521s, actualDur=3.522s, drift=0.001s
```

**Kiểm tra:**
- ✅ `drift` < 0.1s (tốt)
- ⚠️ `drift` > 0.1s (cần chú ý)

#### 2. Video Processing Logs
```
[Video] Segment 0 [gap]: trim=0.0000s→0.5110s, videoDur=0.511s, targetDur=0.511s, actualAudio=0.512s, videoSpeed=1.0000, adjustedSpeed=1.0020, totalSpeed=1.0020, setpts=0.9980*PTS
```

**Kiểm tra:**
- ✅ `totalSpeed = videoSpeed × adjustedSpeed` (công thức đúng)
- ✅ `setpts = 1.0 / totalSpeed` (công thức đúng)
- ⚠️ `totalSpeed > 1.5` (slow motion cao, cần chú ý)

#### 3. Slow Motion Segments
Tìm các dòng có `totalSpeed > 1.3`:
```
[Video] Segment 13 [dubbed]: ... totalSpeed=1.5234, setpts=0.6564*PTS
```

**Ghi chú lại:**
- Segment nào có slow motion cao nhất?
- Có bao nhiêu segments > 1.5x?
- Có bao nhiêu segments > 1.8x?

---

## Bước 6: Kiểm tra Output Video

### File output:
```
C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\final\final_video.mp4
```

### Kiểm tra chất lượng:

#### 1. Frozen Frames (Vấn đề chính)
- ✅ Video chạy mượt mà từ đầu đến cuối
- ❌ Video bị đứng hình ở giữa

#### 2. Audio/Video Sync
- ✅ Âm thanh khớp với hình ảnh
- ❌ Âm thanh chạy trước/sau hình ảnh

#### 3. Slow Motion
- ✅ Chuyển động tự nhiên
- ⚠️ Một số đoạn hơi chậm (chấp nhận được)
- ❌ Nhiều đoạn rất chậm (không chấp nhận được)

#### 4. Audio Quality
- ✅ Âm thanh rõ ràng
- ⚠️ Một số đoạn hơi nhanh (1.4x)
- ❌ Nhiều đoạn quá nhanh (không nghe được)

---

## Bước 7: Báo cáo kết quả

### Thông tin cần ghi lại:

1. **Render thành công?**
   - [ ] Có
   - [ ] Không (lỗi gì?)

2. **Frozen frames?**
   - [ ] Không còn (✅ Fix thành công!)
   - [ ] Vẫn còn (❌ Cần debug thêm)

3. **Slow motion cao nhất?**
   - Segment nào: _______
   - Giá trị: _______x
   - Có chấp nhận được không: [ ] Có [ ] Không

4. **Audio quality?**
   - [ ] Tốt, nghe rõ
   - [ ] Chấp nhận được
   - [ ] Quá nhanh, khó nghe

5. **Tổng thời lượng video?**
   - Expected: ~848s (~14 phút)
   - Actual: _______s

---

## Bước 8: Nếu có vấn đề

### Vấn đề 1: Vẫn còn frozen frames
**Nguyên nhân có thể:**
- Logic vẫn chưa đúng
- FFmpeg command sai

**Giải pháp:**
- Copy toàn bộ logs từ DevTools
- Gửi cho tôi để phân tích

### Vấn đề 2: Slow motion quá cao (>1.8x)
**Giải pháp:**
- Tăng `MAX_AUDIO_SPEEDUP` lên 1.5
- Hoặc implement MAX_VIDEO_SLOWDOWN

### Vấn đề 3: Audio quá nhanh
**Giải pháp:**
- Giảm `MAX_AUDIO_SPEEDUP` xuống 1.3
- Chấp nhận slow motion cao hơn

---

## Debug Tips

### Lưu logs ra file:
1. Trong DevTools Console, click chuột phải
2. Chọn "Save as..."
3. Lưu thành `render-logs.txt`

### Kiểm tra filter script:
```
C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final\video_filter.txt
```

File này chứa tất cả FFmpeg filters được áp dụng.

### Kiểm tra audio segments:
```
C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final\audio_seg_*.wav
```

Có thể mở từng file để nghe thử.

---

## Expected Timeline

| Bước | Thời gian |
|------|-----------|
| Load project | ~5s |
| Audio processing | ~30-60s |
| Audio concatenation | ~5s |
| Video rendering | ~90-120s |
| **Tổng** | **~2-3 phút** |

---

## Checklist

- [ ] Chạy app thành công
- [ ] Load project thành công
- [ ] Mở DevTools
- [ ] Click render
- [ ] Theo dõi logs
- [ ] Render hoàn tất
- [ ] Kiểm tra video output
- [ ] Ghi lại kết quả
- [ ] Báo cáo cho tôi

---

**Lưu ý:** Nếu có bất kỳ lỗi nào, copy toàn bộ error message và gửi cho tôi!
