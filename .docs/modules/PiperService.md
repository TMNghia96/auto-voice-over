# Module: PiperService

## 🎯 Nghiệp vụ (Business Logic)
- **Text to Speech (TTS)**: Chuyển đổi văn bản (phụ đề SRT) thành giọng nói AI chất lượng cao bằng công cụ Piper.
- **Đa giọng đọc (Multivoice)**: Hỗ trợ nhiều giọng đọc khác nhau (nam, nữ, tốc độ nhanh/chậm) thông qua các file model `.onnx`.
- **Tốc độ lồng tiếng**: Tính toán tốc độ đọc (TTS speed) để khớp với phụ đề gốc.

## 🛠 Reference Functions (Các hàm quan trọng)
- `generateAudioSegment(text, voice, outputPath)`: Tạo một đoạn âm thanh lồng tiếng duy nhất từ văn bản.
- `batchGenerateAudio(srtPath, projectPath, options)`: Luồng xử lý hàng loạt tất cả các câu trong file SRT sang thư mục `audio_gene/`.
- `listAvailableVoices()`: Trả về danh sách các giọng đọc hiện có trong thư mục `bin/piper/models/`.

## 🔄 Workflow (Luồng xử lý)
1. **Tiền xử lý**: Đọc file SRT và trích xuất nội dung văn bản.
2. **Khớp thời gian**: Tính toán thời lượng clip video tương ứng để điều chỉnh tốc độ Piper (từ 0.5x đến 4.0x, mặc định thường quanh 1.0x).
3. **Thực thi**: Gọi `piper.exe` với tham số `--model` và nội dung văn bản qua stdin.
4. **Lưu trữ**: Xuất file `.wav` (sau đó thường được convert sang `.mp3` để tiết kiệm dung lượng) vào thư mục `audio_gene/` của dự án.

## ⚠️ Lưu ý & Gotchas
- **Voice Models**: Cần có file `.onnx` và file cấu hình `.onnx.json` tương ứng trong thư mục bin.
- **Dấu câu**: Piper xử lý tốt dấu câu nhưng các ký tự đặc biệt cần được xóa bỏ trước khi đưa vào engine để tránh lỗi.
- **Concurrency**: Khi generate hàng loạt, có thể giới hạn số tiến trình song song để tránh quá tải CPU.
