# Module: McpService

## 🎯 Nghiệp vụ (Business Logic)
- **Model Context Protocol (MCP)**: Cung cấp giao diện server MCP để các mô hình AI có thể kết nối và sử dụng các công cụ (tools) của dự án một cách trực tiếp.
- **Exposing Tools**: Đóng gói các chức năng cốt lõi của dự án (nhận dạng, lồng tiếng, ghép video, quản lý project) thành các Agentic Tools.
- **SSE Transport**: Sử dụng Server-Sent Events (SSE) để giao tiếp thời gian thực giữa MCP client và dự án qua cổng `3000`.

## 🛠 Registered Tools (Danh sách công cụ AI)
- `get_system_status`: Kiểm tra FFmpeg, Whisper, Handbrake.
- `transcribe_audio`: Chuyển đổi âm thanh sang SRT.
- `generate_voice`: Tạo âm thanh AI (TTS) từ văn bản.
- `list_projects`: Lấy danh sách dự án hiện có.
- `get_gpu_info`: Lấy thông số CPU/GPU.
- `merge_audio_video`: Ghép video final.
- `optimize_srt`: Tối ưu hóa file SRT.

## 🔄 Workflow (Luồng xử lý)
1. **Khởi tạo**: Server MCP được tạo với các `capabilities` công cụ.
2. **Đăng ký**: `setupTools()` ánh xạ các hàm trong service (DatabaseService, TranscriptService, v.v.) vào MCP Request Handlers.
3. **SSE Connection**: Lắng nghe tại endpoint `/mcp`. Khi có kết nối, tạo `SSEServerTransport`.
4. **Call Tool**: Nhận yêu cầu từ AI client, thực thi nghiệp vụ tương ứng và trả về kết quả định dạng JSON.

## ⚠️ Lưu ý & Gotchas
- **Port 3000**: Mặc định chạy trên cổng 3000. Nếu cổng này bị chiếm dụng, MCP server sẽ không thể khởi động.
- **CORS**: Cho phép kết nối từ các nguồn khác nhau để AI client (như Claude Desktop hoặc extension trình duyệt) có thể truy cập.
- **Concurrency**: MCP requests được xử lý bất đồng bộ, tuy nhiên một số tác vụ nặng (như merge video) vẫn có thể chiếm dụng tài nguyên hệ thống.
