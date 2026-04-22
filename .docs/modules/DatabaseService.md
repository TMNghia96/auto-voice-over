np# Module: DatabaseService

## 🎯 Nghiệp vụ (Business Logic)
- **Quản lý Dự án**: Lưu trữ thông tin về các dự án đã tạo (tên, đường dẫn, ngày tạo, ghim/unpin).
- **Lưu trữ cục bộ**: Sử dụng SQLite (`better-sqlite3`) cho tốc độ cao và tính ổn định trên máy tính cá nhân.
- **Duy trì trạng thái**: Lưu file `projects.db` tại thư mục ứng dụng (AppData) để không mất dữ liệu của người dùng khi cài lại phần mềm.

## 🛠 Reference Functions (Các hàm quan trọng)
- `connectDB()`: Kết nối SQLite và định nghĩa schema nếu chưa có.
- `getProjects()`: Lấy danh sách dự án (sắp xếp theo trạng thái ghim và ngày tạo).
- `addProject(project)`: Thêm một dự án mới vào danh sách.
- `updateProjectPin(id, pinned)`: Ghim dự án lên đầu danh sách.
- `deleteProject(id)`: Xóa thông tin dự án khỏi danh sách lưu trữ.

## 🔄 Workflow (Luồng xử lý)
1. **Khởi động**: `main.js` gọi `connectDB()` khi cửa sổ chính được tạo.
2. **Setup Schema**: Nếu chưa có bảng `projects`, hệ thống sẽ khởi tạo bảng với các cột `id, name, path, createdAt, pinned`.
3. **Thao tác**: Các hàm `get, add, update, delete` được gọi thông qua IPC từ giao diện người dùng (Renderer).

## 📦 Model & Interfaces (Cấu trúc dữ liệu)
- `Project`: { id, name, path, createdAt, pinned }.
- `ProjectRow`: Cấu trúc dữ liệu thô từ database (pinned là 0 hoặc 1).

## ⚠️ Lưu ý & Gotchas
- **Database Path**: `projects.db` nằm ở `app.getPath('userData')`.
- **Pinned column**: Một số phiên bản cũ có thể chưa có cột `pinned`, vì vậy logic `connectDB` cần khởi tạo đúng schema từ đầu.
- **Sắp xếp**: Thường hiển thị dự án được ghim trước, sau đó tới các dự án mới nhất.
