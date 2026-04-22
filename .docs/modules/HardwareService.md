# Module: HardwareService

## 🎯 Nghiệp vụ (Business Logic)
- **Kiểm tra phần cứng (Hardware Detection)**: Xác định máy tính đang dùng GPU loại nào (Nvidia CUDA, AMD AMF, hay Intel QSV).
- **Tối ưu hóa tài nguyên**: Dựa vào phần cứng để hệ thống quyết định nên dùng Encoder nào cho Video và Engine nào cho Whisper.
- **Vulkan Support**: Kiểm tra xem card đồ họa có hỗ trợ tập lệnh Vulkan không thông qua lệnh `vulkan-cli` hoặc chạy thử trực tiếp binary whisper-vulkan (ở `EnvironmentService`).

## 🛠 Reference Functions (Các hàm quan trọng)
- `getHardwareInfo()`: Hàm tổng quát trả về thông tin CPU mẫu, tên GPU và flag hỗ trợ (hasNvidiaGpu, hasAmdGpu, hasIntelGpu).
- `getNvidiaInfo()`: Thử chạy `nvidia-smi` để lấy thông tin chi tiết.
- `getAmdInfo()` / `getIntelInfo()`: Dùng các lệnh hệ thống (PowerShell/dxdiag) để phân tích tên GPU.

## 🔄 Workflow (Luồng xử lý)
1. **Thiết lập**: Chạy khi ứng dụng khởi động (`setupEnvironment`).
2. **Hành trình**:
    - Quét toàn bộ card đồ họa qua hệ thống Windows (WMI - Windows Management Instrumentation).
    - Phân loại card theo chuỗi ký tự (ví dụ: "NVIDIA", "Radeon", "Intel Graphics").
    - Trả về object chứa các cờ (flags) để các module khác (Transcript, FinalVideo) sử dụng.

## 📦 Model & Interfaces (Cấu trúc dữ liệu)
- `HardwareInfo`: { hasNvidiaGpu, hasAmdGpu, hasIntelGpu, gpuName, cpuName }.

## ⚠️ Lưu ý & Gotchas
- **Windows Only**: Hiện tại chỉ hỗ trợ tốt việc nhận dạng GPU trên Windows.
- **Vulkan Test**: Việc thực sự hỗ trợ Vulkan hay không đôi khi phải kiểm tra bằng cách cố gắng khởi động binary (được thực hiện bổ sung trong `EnvironmentService.isWhisperEngineReady`).
- **Nvidia SMI**: `nvidia-smi` chỉ có khi người dùng đã cài driver chính thức. Hệ thống có cơ chế fallback nếu lệnh này không tồn tại.
