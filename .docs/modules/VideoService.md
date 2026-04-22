# Module: VideoService

## 🎯 Nghiệp vụ (Business Logic)
- **Tải Video YouTube**: Sử dụng `yt-dlp` để tải toàn bộ video hoặc trích xuất âm thanh từ URL YouTube.
- **Tiền xử lý Video**: Cắt video (trimming), resize video (phục vụ preview) và kiểm tra metadata của file video.
- **Trích xuất âm thanh**: Tách audio từ file video gốc để chuẩn bị cho quá trình nhận dạng giọng nói (SRT).

## 🛠 Reference Functions (Các hàm quan trọng)
- `getVideoInfo(url)`: Lấy thông tin tiêu đề, độ dài, mô tả và thumbnail của video YouTube.
- `downloadVideo(url, targetPath, onProgress)`: Tải file video chất lượng tốt nhất dùng cho project.
- `extractAudioFromVideo(videoPath, audioPath)`: Tách âm thanh sang dạng `.wav` hoặc `.mp3` chất lượng cao.
- `trimVideo(input, output, startTime, duration)`: Cắt video theo khoảng thời gian chỉ định.

## 🔄 Workflow (Luồng xử lý)
1. **Phân tích**: Gọi `yt-dlp --dump-json` để nhận dữ liệu video.
2. **Setup**: Tạo các folder `original/video` và `original/audio` trong thư mục dự án.
3. **Execution**: Chạy tiến trình con (child process) thực thi tải về hoặc trích xuất.
4. **Validation**: Kiểm tra file sau khi tải để đảm bảo tính toàn vẹn (không bị lỗi corrupted).

## ⚠️ Lưu ý & Gotchas
- **yt-dlp**: Cần được cập nhật thường xuyên để tránh lỗi từ phía YouTube (Service này tự động dùng bản mới nhất từ `EnvironmentService`).
- **8.3 Short Path**: Khi truyền đường dẫn vào CLI qua tham số, luôn sử dụng short path để xử lý lỗi khoảng trắng trên Windows.
- **FFmpeg**: Được dùng để xử lý cắt ghép cơ bản và trích xuất âm thanh cực nhanh trước khi bắt đầu quy trình lồng tiếng.
