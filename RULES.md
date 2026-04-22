# 📑 Quy tắc phát triển dự án (Project Development Rules)

Bạn đang hỗ trợ phát triển dự án **Auto-Voice-Over-Tool**. Để đảm bảo tính ổn định và chính xác cao nhất cho hệ thống (đặc biệt là trên Windows), bạn PHẢI tuân thủ các quy tắc sau:

## 1. Ưu tiên Tài liệu (Docs First)
- Trước khi thực hiện bất kỳ thay đổi nào liên quan đến logic nghiệp vụ hoặc sửa đổi mã nguồn, bạn **PHẢI** kiểm tra thư mục `.docs/modules/` để tìm module liên quan.
- Phải đọc file `.docs/Architecture.md` để hiểu luồng đi của dữ liệu trước khi đề xuất các thay đổi ảnh hưởng đến nhiều module.

## 2. Quy tắc đường dẫn Windows (Path Handling)
- **CỰC KỲ QUAN TRỌNG**: Tuyệt đối KHÔNG truyền đường dẫn dài (Long Path) chứa dấu tiếng Việt hoặc khoảng trắng vào các công cụ CLI (`ffmpeg`, `whisper-cli`, `HandBrakeCLI`).
- **PHẢI** luôn sử dụng hàm `getWindowsShortPath` từ `src/lib/PathUtils.ts` để chuyển đổi đường dẫn sang định dạng 8.3 (Short Path) trước khi thực thi lệnh.

## 3. Đồng bộ hóa Tài liệu (Doc-Sync Loop)
- Sau khi thực hiện bất kỳ thay đổi nào làm thay đổi logic nghiệp vụ, workflow hoặc thay đổi tên hàm/interface quan trọng, bạn **PHẢI** cập nhật file `.md` tương ứng trong `.docs/modules/`.
- Nếu phát hiện logic thực tế trong code khác với những gì được viết trong docs, hãy báo cáo cho người dùng và cập nhật lại docs cho chính xác.

## 4. Kiểm soát Phần cứng & Render
- Khi tư vấn về Render video hoặc Transcription, phải dựa trên kết quả của `HardwareService.md`.
- Ghi nhớ giới hạn GPU: Nvidia NVENC thường chỉ cho phép tối đa **3 session** mã hóa đồng thời (Dự án đã cấu hình `CONCURRENCY = 3`).
- Quy trình Render Video luôn gồm: Phân tích -> Render Segments -> Ghép nối (Concat) -> Đồng bộ hóa với HandBrake (CFR Mode).

## 5. Xử lý Lỗi & Log
- Mọi lỗi phát sinh từ các tiến trình con (child_process) phải được log chi tiết bao gồm cả `stderr`.
- Luôn kiểm tra tính sẵn sàng của môi trường (`isEnvironmentReady`) trước khi thực hiện các tác vụ nặng.

---
*Lưu ý: Luôn phản hồi bằng tiếng Việt và giải thích rõ ràng các quyết định kỹ thuật dựa trên bộ quy tắc này.*
