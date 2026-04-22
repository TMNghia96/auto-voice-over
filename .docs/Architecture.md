# Architecture Overview: Auto-Voice-Over-Tool

Dự án này là một ứng dụng Electron hỗ trợ tự động lồng tiếng cho video bằng AI. Dưới đây là cách các module chính phối hợp với nhau:

## 🧭 Luồng xử lý chính (Main Workflow)

1.  **Thiết lập môi trường (`EnvironmentService`)**:
    *   Tải các công cụ CLI (`ffmpeg`, `whisper-cli`, `HandBrakeCLI`, `yt-dlp`).
    *   Kiểm tra phần cứng (`HardwareService`) để chọn engine tối ưu.
    *   Tất cả engine Whisper (CPU, GPU CUDA, OpenBLAS) đều sử dụng pre-built binary từ whisper.cpp v1.8.4.
    *   Tự động xoá folder `whisper-vulkan/` legacy nếu tồn tại.

2.  **Quản lý dự án (`DatabaseService`)**:
    *   Tạo folder dự án, lưu thông tin vào `projects.db`.
    *   Cấu trúc thư mục dự án gồm: `original/` (video gốc), `transcript/` (SRT), `audio_gene/` (tiếng AI), `final/` (kết quả).

3.  **Tạo bản dịch (`TranscriptService`)**:
    *   Trích xuất âm thanh từ video gốc bằng FFmpeg.
    *   Sử dụng Whisper CLI chuyển đổi tiếng nói thành tệp SRT (Phụ đề).
    *   Tối ưu hóa thời gian hiển thị nhãn phụ đề (`SrtOptimizer`).

4.  **Tạo Video Final (`FinalVideoService`)**:
    *   Đọc SRT và thư mục âm thanh AI (`audio_gene`).
    *   **Trộn âm thanh (Audio Mixing)**: Tự động lồng tiếng AI vào video gốc, hỗ trợ **Audio Ducking** (giảm âm lượng nền khi có tiếng AI).
    *   Cắt video gốc thành hàng trăm đoạn nhỏ (Segments).
    *   Khớp tiếng AI với hình ảnh (Dùng `h264_nvenc` hoặc `h264_amf` để xử lý nhanh).
    *   Ghép (Concat) tất cả các đoạn lại.
    *   Re-render bằng HandBrake để đồng bộ khung hình tuyệt đối.

## 🔒 Bảo mật & Giao tiếp (IPC Architecture)

Dự án tuân thủ nghiêm ngặt quy tắc **Context Isolation** của Electron:
*   **Renderer Process**: Không truy cập trực tiếp vào các module Node.js (`fs`, `path`, `child_process`).
*   **Preload Script**: Chỉ exposing các API an toàn thông qua `contextBridge`.
*   **BrowserPathUtils**: Một tiện ích phía Renderer giúp xử lý đường dẫn an toàn trên trình duyệt trước khi gửi về Main process.
*   **IPC Handlers**: Tất cả các thao tác hệ thống (đọc file, chạy CLI) đều được thực hiện ở Main process thông qua các handler đã định nghĩa.

## 📁 Danh mục Tài liệu Module
- [EnvironmentService](./modules/EnvironmentService.md): Quản lý cài đặt & Binary.
- [TranscriptService](./modules/TranscriptService.md): Nhận dạng giọng nói (Whisper).
- [FinalVideoService](./modules/FinalVideoService.md): Ghép video (Render & Sync).
- [DatabaseService](./modules/DatabaseService.md): Lưu trữ dữ liệu SQLite.
- [HardwareService](./modules/HardwareService.md): Phát hiện GPU & CPU.
- [McpService](./modules/McpService.md): Giao diện AI (Model Context Protocol).
- [PiperService](./modules/PiperService.md): Lồng tiếng AI (Text-to-Speech).
- [VideoService](./modules/VideoService.md): Tải & trích xuất Video.
- [ConfigService](./modules/ConfigService.md): Quản lý cấu hình & Glossary.

## 🚀 Cách sử dụng Docs này với AI
Khi yêu cầu AI thực hiện một thay đổi lớn, hãy đưa ra câu lệnh như:
*"Dựa trên quy trình trong `FinalVideoService.md`, hãy tối ưu hóa việc ghép video để không cần re-render bằng HandBrake nếu video đầu ra đã đồng bộ."*
hoặc
*"Hãy kiểm tra `TranscriptService.md` và cho biết cách thêm engine nhận dạng của OpenAI API."*
