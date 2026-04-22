# Module: TranscriptService

## 🎯 Nghiệp vụ (Business Logic)
- **Nhận dạng giọng nói (Whisper)**: Chuyển đổi audio từ video sang dạng văn bản (SRT) thông qua công cụ Whisper. Hỗ trợ đa ngôn ngữ.
- **Tăng tốc phần cứng**: Cho phép sử dụng CPU, GPU (NVIDIA CUDA), hoặc OpenBLAS (CPU Accelerated) để tối ưu hóa thời gian nhận dạng.
- **Xử lý Audio**: Tích hợp FFmpeg để tách âm thanh từ video và chuyển sang định dạng WAV 16kHz mono (chuẩn cho Whisper).
- **Tối ưu hóa kết quả**: Gọi `optimizeSrtFile` để định dạng lại nhãn thời gian và nội dung SRT trước khi sử dụng.

## 🛠 Reference Functions (Các hàm quan trọng)
- `runWhisper(args)`: Hàm lõi thực thi `whisper-cli.exe` với xử lý log tiến trình và lỗi thời gian thực.
- `convertAudioToWav(inputPath, outputPath)`: Tách âm thanh từ video bằng FFmpeg, chuẩn hóa định dạng (-ar 16000, -ac 1).
- `generateTranscript(projectPath, onProgress)`: Luồng chính nhận video gốc, tách audio, chạy nhận dạng, và lưu file SRT vào `transcript/`.

## 🔄 Workflow (Luồng xử lý)
1. **Khởi động**: Xác định Engine (CPU/GPU/OpenBLAS) và Model (Base/Medium...) đang chọn.
2. **Tiền xử lý**: Chạy FFmpeg tách audio từ video gốc thành `audio_for_transcript.wav`.
3. **Thực thi**: Gọi `whisper-cli.exe` với các tham số: `-m` (model), `-f` (wav), `-osrt`, `-of` (output_path).
4. **Hậu xử lý**: Đọc SRT được tạo ra, chạy `optimizeSrtFile` để dọn dẹp nội dung, sau đó lưu thành `original_transcript.srt`.

## 📦 Model & Interfaces (Cấu trúc dữ liệu)
- `TranscriptEngine`: 'whisper-cpu' | 'whisper-gpu' | 'whisper-openblas'.
- `TranscriptProgress`: { status, progress, detail, current, total }.

## ⚠️ Lưu ý & Gotchas
- **Encoding**: File SRT được Whisper tạo ra thường có lỗi BOM hoặc mã hóa nếu đường dẫn chứa ký tự đặc biệt. Hiện tại đã giải quyết bằng **8.3 Short Path** (`getWindowsShortPath`).
- **Memory**: GPU NVENC encoding và Whisper GPU có thể xung đột bộ nhớ nếu dung lượng VRAM thấp.
- **SrtOptimizer (New)**: Thuật toán tối ưu hóa đã được nâng cấp để:
    - Hỗ trợ Unicode Tiếng Việt tuyệt đối (không ngắt sai ở chữ cái viết hoa có dấu).
    - Không ngắt câu ở các từ viết tắt phổ biến (Mr., Dr., Đ., ông., bà.).
    - Giữ lại các khoảng lặng (Gap) tự nhiên của video gốc nếu im lặng > 500ms.
    - Đảm bảo các đoạn phụ đề sau khi gộp không bao giờ vượt quá 12 giây để đảm bảo độ mượt khi render.
