# Module: FinalVideoService

## 🎯 Nghiệp vụ (Business Logic)
- **Ghép Video lồng tiếng (Tạo Video Final)**: Kết hợp video gốc với các tệp âm thanh đã được lồng tiếng (dubbed audio) dựa trên tệp SRT.
- **Trộn âm thanh nâng cao (Audio Mixing)**:
    - **Audio Ducking**: Tự động giảm âm lượng video gốc khi có tiếng AI lồng vào (mặc định 0.1x).
    - **Audio Fade Transition**: Chuyển tiếp âm lượng mượt mà giữa đoạn gap (100%) và dubbed (bgVol). Đoạn gap được fade-out (1.0 → bgVol) trước đoạn lồng tiếng và fade-in (bgVol → 1.0) sau đoạn lồng tiếng, tránh giật cục.
    - **Original Audio Mapping**: Nếu video gốc có âm thanh, hệ thống sẽ sử dụng bộ lọc `amix` để trộn; nếu không, sẽ tạo track im lặng để tránh lỗi đồng bộ.
    - **External Audio Muxing**: Nếu video không có audio stream bên trong (thường xảy ra khi tải từ YouTube/yt-dlp, video và audio được lưu riêng biệt ở `original/video/` và `original/audio/`), hệ thống sẽ tự động mux (ghép) chúng lại thành file tạm trước khi xử lý.
- **Xử lý thời gian (Sync)**: Đảm bảo âm thanh và video khớp nhau.
    - **Natural Dubbing**: Hạn chế tốc độ âm thanh tối đa 1.3x.
    - **Smooth Playback**: Nếu âm thanh lồng tiếng dài hơn đoạn video gốc (dù đã tăng tốc), hệ thống sẽ **giảm tốc độ video** (Slow-motion) để khớp hoàn hảo.
- **Tăng tốc Render**: Sử dụng nhân phần cứng `h264_amf` (AMD), `h264_nvenc` (Nvidia) hoặc `libx264` (CPU) để render từng đoạn nhỏ (segments) trước khi ghép lại.
- **Khử lỗi lag/lệch tiếng**: Ghép các đoạn video bằng phương pháp **Concat** sau đó chạy qua **HandBrakeCLI** để sửa đồng bộ khung hình (Constant Framerate - CFR).

## 🛠 Reference Functions (Các hàm quan trọng)
- `processSegment(segment, videoPath, tempDir, segIndex, options)`: Hàm lõi xử lý từng đoạn cắt nhỏ. Hỗ trợ `backgroundVolume` và `originalHasAudio`.
- `createFinalVideo(projectPath, onProgress, options)`: Luồng chính điều phối, tự động phát hiện và mux audio ngoài nếu cần.
- `concatenateSegments(segmentPaths, outputPath)`: Sử dụng FFmpeg concat để ghép các đoạn nhỏ thành 1 file.
- `rerenderWithHandBrake(input, output)`: Dùng HandBrake (CFR mode) để sửa đồng bộ.
- `setupHardwareEncoders()`: Tự động phát hiện GPU để chọn encoder phần cứng phù hợp.
- `hasAudioStream(filePath)`: Kiểm tra video có audio stream, dùng `ffmpeg -i` (không dùng `ffprobe`). Có cache.
- `findOriginalAudio(projectPath)`: Tìm file audio gốc tại `original/audio/` (yt-dlp tải riêng).
- `buildVoiceOnlyArgs(...)`: Tạo FFmpeg args cho trường hợp voice-only (fallback khi amix thất bại).
- `buildGapVolumeFilter(duration, bgVol, fadeIn, fadeOut)`: Tạo FFmpeg volume expression để chuyển tiếp âm lượng mượt mà ở gap segments (fade 0.5s, điều chỉnh tự động theo độ dài gap).

## 🔄 Workflow (Luồng xử lý)
1. **Phân tích**: Đọc file SRT và thư mục `audio_gene/` để dựng `buildSegmentMap`.
2. **Kiểm tra Audio**: Kiểm tra video gốc có audio stream không. Nếu không, tìm file audio gốc ở `original/audio/` và mux chúng lại.
3. **Xử lý đoạn (Concurrency = 3)**: Chạy song song 3 tác vụ xử lý từng đoạn nhỏ.
    - Nếu có âm thanh nền: Mix video + audio nền (ducked) + AI voice qua `amix`.
    - Nếu amix thất bại: Fallback sang chỉ dùng giọng AI.
    - Nếu là đoạn trống (gap): Trích xuất video từ gốc (kèm audio nền nếu có), áp dụng **fade transition** nếu gap nằm cạnh đoạn dubbed.
4. **Ghép (Concat)**: Tạo file `concat_list.txt` và ghép tất cả thành `final_video.mp4`.
5. **Đồng bộ hóa (HandBrake)**: Re-render để sửa lỗi Frame timing.

## 📦 Model & Interfaces
- `Segment`: videoStart, videoEnd, audioPath, audioDuration, type ('dubbed' | 'gap').
- `FinalVideoProgress`: preparing, processing, concatenating, rerendering, done, error.

## ⚠️ Lưu ý & Gotchas
- **Windows Path**: Luôn dùng `getWindowsShortPath` cho đầu vào FFmpeg/HandBrake.
- **GPU Limit**: `CONCURRENCY = 3` vì NVENC giới hạn 3 session.
- **Keyframe Error**: Không dùng `-c copy` cho từng đoạn, phải re-encode toàn bộ.
- **Audio Mixing**: Dùng `aformat` chuẩn hoá audio trước `amix`. Phải dùng `normalize=0`.
- **External Audio (yt-dlp)**: Video tải từ YouTube có video và audio ở **2 file riêng biệt**. Phải tự mux trước khi xử lý.
- **hasAudioStream**: Dùng `ffmpeg -i` (KHÔNG dùng `ffprobe`) vì `ffprobe.exe` có thể chưa được giải nén.
- **HandBrake**: Bước cứu cánh để video mượt mà trên mọi thiết bị.
