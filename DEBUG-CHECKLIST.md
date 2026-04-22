# Checklist Debug - Video vẫn bị lỗi

## ⚠️ Vấn đề: Video vẫn bị frozen frames sau khi fix

### Nguyên nhân có thể:

1. **Electron app chưa restart** - Code cũ vẫn đang chạy
2. **TypeScript chưa compile** - Build cũ vẫn được sử dụng
3. **Cache chưa clear** - Temp files cũ
4. **Memory leak** - Quá nhiều segments xử lý song song

---

## ✅ Bước 1: Verify code đã fix

Kiểm tra dòng 703 trong FinalVideoService.ts:

```bash
Get-Content src\services\FinalVideoService.ts | Select-String -Pattern "adjustedSpeed" -Context 2
```

**Phải thấy:**
```typescript
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
```

**KHÔNG phải:**
```typescript
const adjustedSpeed = actualSegmentDuration / seg.videoDuration; // SAI!
```

---

## ✅ Bước 2: Stop tất cả processes

```bash
# Stop Electron app nếu đang chạy
taskkill /F /IM electron.exe

# Stop Node processes
taskkill /F /IM node.exe
```

---

## ✅ Bước 3: Clear cache và rebuild

```bash
cd C:\Users\tranm.DESKTOP-8VO69Q5\Documents\project_code\auto-voice-over

# Clear node_modules/.cache
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue

# Clear .webpack cache
Remove-Item -Recurse -Force .webpack -ErrorAction SilentlyContinue

# Clear temp_final folder
Remove-Item -Recurse -Force "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final" -ErrorAction SilentlyContinue

# Rebuild
npm run package
```

---

## ✅ Bước 4: Restart app HOÀN TOÀN

```bash
# Start fresh
npm start
```

**QUAN TRỌNG:** 
- Đóng tất cả cửa sổ Electron cũ
- Chỉ mở 1 instance duy nhất

---

## ✅ Bước 5: Xóa video output cũ

```bash
Remove-Item "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\final\final_video.mp4" -ErrorAction SilentlyContinue
```

Để đảm bảo render video mới, không phải video cũ.

---

## ✅ Bước 6: Render lại với logging

1. Mở DevTools TRƯỚC KHI render
2. Click "Render Final Video"
3. Kiểm tra logs:

**Phải thấy:**
```
[Video] Segment N: ... adjustedSpeed=X.XXXX, totalSpeed=X.XXXX, setpts=X.XXXX*PTS
```

**Nếu KHÔNG thấy logs này** → Code cũ vẫn đang chạy!

---

## ✅ Bước 7: Giảm CONCURRENCY nếu memory issue

Nếu vẫn lỗi, có thể do memory. Edit `FinalVideoService.ts`:

```typescript
// Dòng 415: Giảm từ 6 xuống 2
const CONCURRENCY = 2; // Giảm để tránh memory issue
```

Sau đó restart app.

---

## 🔍 Debug: Kiểm tra logs chi tiết

### Log phải có:

```
[Audio] Segment 0 (gap): videoDur=0.511s, targetDur=0.511s, actualDur=0.512s, drift=0.001s
[Video] Segment 0 [gap]: trim=0.0000s→0.5110s, videoDur=0.511s, targetDur=0.511s, actualAudio=0.512s, videoSpeed=1.0000, adjustedSpeed=1.0020, totalSpeed=1.0020, setpts=0.9980*PTS
```

### Nếu KHÔNG có logs này:

**→ Code chưa được load!**

Giải pháp:
1. Stop app hoàn toàn
2. Clear cache
3. Rebuild: `npm run package`
4. Start lại: `npm start`

---

## 🐛 Debug: Kiểm tra build output

```bash
# Kiểm tra file đã compile
Get-Content .webpack\main\index.js | Select-String -Pattern "adjustedSpeed" -Context 2
```

Phải thấy logic mới trong file compiled.

---

## 📊 Memory Usage Check

Nếu nghi ngờ memory issue:

```bash
# Mở Task Manager
# Theo dõi:
# - Electron.exe memory usage
# - Node.exe memory usage
# - FFmpeg.exe memory usage (khi render)
```

**Nếu memory > 4GB** → Giảm CONCURRENCY xuống 2 hoặc 1

---

## ⚡ Quick Fix Script

```powershell
# Stop all
taskkill /F /IM electron.exe 2>$null
taskkill /F /IM node.exe 2>$null

# Clear
cd C:\Users\tranm.DESKTOP-8VO69Q5\Documents\project_code\auto-voice-over
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .webpack -ErrorAction SilentlyContinue
Remove-Item "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\final\final_video.mp4" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final" -ErrorAction SilentlyContinue

# Rebuild
npm run package

# Start
npm start
```

---

## 📝 Checklist

- [ ] Verify code fix (adjustedSpeed / targetDuration)
- [ ] Stop all Electron/Node processes
- [ ] Clear cache (.webpack, node_modules/.cache)
- [ ] Delete old output video
- [ ] Delete temp_final folder
- [ ] Rebuild: npm run package
- [ ] Start fresh: npm start
- [ ] Open DevTools BEFORE render
- [ ] Render video
- [ ] Check logs for new format
- [ ] Verify output video

---

## ❓ Nếu vẫn lỗi

Gửi cho tôi:
1. Screenshot DevTools logs (toàn bộ)
2. Nội dung file: `temp_final/video_filter.txt`
3. Output của: `Get-Content src\services\FinalVideoService.ts | Select-String -Pattern "adjustedSpeed" -Context 3`

Tôi sẽ debug tiếp!
