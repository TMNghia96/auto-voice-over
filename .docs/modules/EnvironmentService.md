# Module: EnvironmentService

## 🎯 Nghiệp vụ (Business Logic)
- **Quản lý Binary**: Tự động tải, giải nén và kiểm tra tính sẵn sàng của các công cụ bên ngoài (CLI tools) cần thiết cho project: `yt-dlp`, `ffmpeg`, `ffprobe`, `HandBrakeCLI`, `whisper.cpp` (CPU/GPU CUDA/OpenBLAS).
- **Quản lý Model**: Cho phép tải, xóa và chọn Model Whisper đang hoạt động (Tiny, Base, Small, Medium, Large).
- **Thiết lập Môi trường**: Đảm bảo tất cả các phụ thuộc được cài đặt đúng vị trí (`bin/` folder) trước khi ứng dụng bắt đầu các tiến trình xử lý.
- **Tương thích Windows**: Sử dụng đường dẫn 8.3 (Short Path) để tránh lỗi khi làm việc với các thư mục có dấu tiếng Việt hoặc khoảng trắng phức tạp.
- **Legacy Cleanup**: Tự động xoá folder `whisper-vulkan/` cũ khi khởi động (migration từ v1.8.3).

## 🛠 Reference Functions (Các hàm quan trọng)
- `setupEnvironment(onProgress)`: Hàm tổng thể kiểm tra và cài đặt tất cả công cụ thiếu.
- `isEnvironmentReady()`: Kiểm tra nhanh xem tất cả công cụ cốt lõi đã có sẵn chưa.
- `getFfprobePath()`: Trả về đường dẫn đến thực thi ffprobe (dùng để check thông tin audio steam).
- `getYtDlpPath()`: Trả về đường dẫn đến thực thi yt-dlp (dùng để tải video YouTube).
- `downloadFile(url, destPath, onProgress)`: Tải tệp với hỗ trợ redirect (quan trọng cho GitHub releases).
- `extractExeFromZip(zipPath, destDir, exeName)`: Sử dụng PowerShell để giải nén công cụ và các tệp DLL đi kèm, có cơ chế đóng tiến trình đang treo để tránh lỗi Access Denied.
- `getWhisperPath(engine)`: Trả về đường dẫn đến binary whisper-cli tương ứng với engine (cpu, gpu, openblas).
- `cleanupLegacyVulkanDir()`: Xoá folder `whisper-vulkan/` cũ nếu tồn tại.

## 🔄 Workflow (Luồng xử lý)
1. **Khởi động**: `main.js` gọi `isEnvironmentReady()`.
2. **Cleanup**: Xoá folder `whisper-vulkan/` legacy nếu tồn tại.
3. **Cài đặt**: Nếu thiếu, gọi `setupEnvironment()`.
4. **Tải xuống**: `downloadFile` tải các gói ZIP từ GitHub releases (whisper.cpp v1.8.4).
5. **Giải nén**: `extractExeFromZip` giải nén vào thư mục `bin/`.
6. **Kiểm tra**: `isWhisperEngineReady` kiểm tra binary tồn tại.

## 📦 Engine Variants (Biến thể Engine)
- **CPU** (`whisper-cpu`): Binary thuần CPU, tải từ `whisper-bin-x64.zip`.
- **GPU CUDA** (`whisper-gpu`): Tăng tốc NVIDIA CUDA, tải từ `whisper-cublas-12.4.0-bin-x64.zip`.
- **OpenBLAS** (`whisper-openblas`): Tăng tốc CPU qua OpenBLAS, tải từ `whisper-blas-bin-x64.zip`.

Tất cả đều là pre-built binary, không cần compile.

## 📦 Model & Interfaces (Cấu trúc dữ liệu)
- `WhisperModelInfo`: Thông tin chi tiết về từng model (ID, tên file, dung lượng, trạng thái tải).
- `SetupProgress`: Interface cho callback tiến trình (status, progress, detail).

## ⚠️ Lưu ý & Gotchas
- **Windows Path**: Luôn dùng `getWindowsShortPath` khi truyền đường dẫn vào PowerShell hoặc CLI tools để tránh lỗi encoding.
- **Process Locking**: `extractExeFromZip` phải Stop-Process trước khi ghi đè file .exe.
- **Dev vs Prod**: Trong Dev, `bin/` nằm ở project root. Trong Prod (đóng gói), `bin/` nằm ở `userData` của ứng dụng.
- **Version**: Hiện tại sử dụng whisper.cpp v1.8.4 (latest release).
