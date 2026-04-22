# Module: ConfigService

## 🎯 Nghiệp vụ (Business Logic)
- **Quản lý Cấu hình**: Lưu trữ và truy xuất các cài đặt của ứng dụng (API Keys, đường dẫn mặc định, âm lượng nhạc nền mặc định, v.v.).
- **Quản lý Project Metadata**: Đọc và ghi file `project.json` bên trong từng thư mục dự án để lưu trạng thái riêng biệt của dự án đó.
- **Tiền xử lý Dịch thuật**: Quản lý các mã "System Prompt" và bảng thuật ngữ (Glossary) để tối ưu hóa việc dịch phụ đề bằng AI (ví dụ: Minecraft Glossary).

## 🛠 Reference Functions (Các hàm quan trọng)
- `readConfig()` / `writeConfig(updates)`: Đọc/ghi file cấu hình toàn cục `config.json` trong AppData.
- `getApiKey(provider)` / `setApiKey(provider, key)`: Quản lý các API key cho OpenAI, Anthropic, Gemini, v.v.
- `createProjectFolder(basePath, projectName)`: Khởi tạo cấu trúc thư mục dự án và file metadata ban đầu.
- `getProjectMetadata(projectPath)`: Lấy thông tin trạng thái của một dự án cụ thể.
- `getPrompts()` / `savePrompts(prompts)`: Quản lý danh sách các mẫu prompt dịch thuật.
- `getDefaultBackgroundVolume()` / `setDefaultBackgroundVolume(volume)`: Đọc/ghi mức âm lượng nhạc nền mặc định (0-100, mặc định: 10). Giá trị được lưu vào `config.json` và tự động load khi mở bước 5 (Tạo video).

## 🔄 Workflow (Luồng xử lý)
1. **Khởi tạo**: Khi ứng dụng chạy, `ConfigService` xác định vị trí file `config.json` (Dev vs Prod).
2. **Truy xuất**: Renderer yêu cầu cấu hình (ví dụ: lấy API key) qua IPC.
3. **Cập nhật**: Khi người dùng thay đổi cài đặt, `writeConfig` thực hiện merge dữ liệu mới vào file JSON.

## ⚠️ Lưu ý & Gotchas
- **Windows Path**: File cấu hình toàn cục được lưu tại `app.getPath('userData')`.
- **Minecraft Glossary**: Mặc định cung cấp một bảng thuật ngữ Minecraft rất chi tiết để đảm bảo chất lượng dịch thuật cho các video game.
- **Project Isolation**: Mỗi folder dự án là một thực thể độc lập với file `project.json` riêng, giúp dễ dàng di chuyển hoặc backup dự án.
