# 🤖 Hướng dẫn Kết nối MCP với AI Tools

## 📖 Giới thiệu

AVOT cung cấp **Model Context Protocol (MCP) Server** cho phép các AI tools như OpenCode, Claude Desktop, Cline, Codex, Antigravity tự động kết nối và sử dụng 19 công cụ lồng tiếng video.

**Server URL:** `http://localhost:3000/mcp`  
**Protocol:** Server-Sent Events (SSE)  
**Tools:** 19 tools (xem danh sách bên dưới)

---

## 🚀 Khởi động MCP Server

### Bước 1: Build MCP Server
```bash
npm run mcp:build
```

### Bước 2: Khởi động Server
```bash
npm run mcp:start
```

Hoặc:
```bash
electron dist-mcp/mcp-main.js
```

### Bước 3: Kiểm tra kết nối
```bash
curl http://localhost:3000/health
# Output: {"status":"ok","mcp":false}
```

**Lưu ý:** Server sẽ chạy ở cổng 3000. Đảm bảo cổng này không bị chiếm dụng.

---

## 🔌 Kết nối với OpenCode

### Cấu hình tự động

Thêm vào file `~/.config/opencode/opencode.json` (Linux/macOS) hoặc `%USERPROFILE%\.config\opencode\opencode.json` (Windows):

```json
{
  "mcpServers": {
    "auto-voice-over": {
      "url": "http://localhost:3000/mcp",
      "type": "sse"
    }
  }
}
```

### Sử dụng trong OpenCode

OpenCode sẽ tự động phát hiện và kết nối với MCP server. Bạn có thể:

1. **Lồng tiếng video trực tiếp:**
   ```
   Lồng tiếng video này: https://youtu.be/VIDEO_ID
   ```

2. **Kiểm tra tiến độ:**
   ```
   Kiểm tra tiến độ pipeline
   ```

3. **Xem danh sách project:**
   ```
   Liệt kê các project đã lồng tiếng
   ```

---

## 🔌 Kết nối với Claude Desktop

### Cấu hình

Thêm vào file cấu hình Claude Desktop:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "auto-voice-over": {
      "url": "http://localhost:3000/mcp",
      "transport": "sse"
    }
  }
}
```

### Khởi động lại Claude Desktop

Sau khi lưu config, khởi động lại Claude Desktop. MCP tools sẽ xuất hiện trong danh sách tools.

---

## 🔌 Kết nối với Cline/Roo-Cline

### Cấu hình trong VS Code

1. Mở VS Code Settings (JSON): `Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)"
2. Thêm cấu hình MCP:

```json
{
  "cline.mcpServers": {
    "auto-voice-over": {
      "url": "http://localhost:3000/mcp",
      "type": "sse"
    }
  }
}
```

### Sử dụng

Cline sẽ tự động load MCP tools. Bạn có thể yêu cầu Cline:
- "Use auto-voice-over MCP to dub this video"
- "Check the status of the dubbing pipeline"

---

## 🔌 Kết nối với Codex/Antigravity

### Cấu hình Generic MCP Client

Các AI tools khác hỗ trợ MCP có thể kết nối bằng cách:

**1. SSE Connection (TypeScript/JavaScript):**
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(new URL('http://localhost:3000/mcp'));
const client = new Client({ name: 'my-client', version: '1.0.0' }, {});
await client.connect(transport);

// List tools
const tools = await client.listTools();

// Call tool
const result = await client.callTool({
  name: 'get_video_info',
  arguments: { url: 'https://youtu.be/VIDEO_ID' }
});
```

**2. Config file format (nếu tool hỗ trợ):**
```json
{
  "mcpServers": {
    "auto-voice-over": {
      "url": "http://localhost:3000/mcp",
      "type": "sse"
    }
  }
}
```

---

## 📦 Danh sách 19 MCP Tools

### 1. System & Info Tools

| Tool | Mô tả |
|------|-------|
| `get_system_status` | Kiểm tra trạng thái FFmpeg, Whisper, GPU |
| `get_gpu_info` | Thông số CPU, RAM, GPU |
| `get_video_info` | Lấy metadata video YouTube (title, duration, author) |
| `list_projects` | Danh sách project đã tạo |
| `list_whisper_models` | Danh sách Whisper models có sẵn |

### 2. Project Management Tools

| Tool | Mô tả |
|------|-------|
| `create_project` | Tạo project mới và lưu vào database |
| `download_video_to_project` | Tải video/audio từ URL vào project |
| `transcribe_project` | Tạo SRT gốc từ audio (Whisper) |
| `translate_project_srt` | Dịch SRT sang ngôn ngữ khác (DeepSeek) |
| `generate_project_audio` | Tạo voice-over audio từ SRT đã dịch (Edge TTS) |
| `create_project_final_video` | Render video cuối cùng với audio ducking |

### 3. Pipeline Tools (Async)

| Tool | Mô tả |
|------|-------|
| `run_full_pipeline` | Chạy toàn bộ workflow bất đồng bộ (trả về ngay, chạy nền) |
| `get_pipeline_status` | Kiểm tra tiến độ pipeline từ file status |
| `cancel_pipeline` | Hủy pipeline đang chạy |

### 4. Utility Tools

| Tool | Mô tả |
|------|-------|
| `transcribe_audio` | Transcribe file audio thành SRT |
| `generate_voice` | Text-to-Speech từ text đơn lẻ |
| `optimize_srt` | Tối ưu và format lại file SRT |
| `merge_audio_video` | Ghép audio vào video |
| `download_model` | Tải Whisper model về máy |

---

## 💡 Ví dụ Sử dụng

### Ví dụ 1: Lồng tiếng video đơn giản (Async Pipeline)

```typescript
// 1. Lấy thông tin video
const videoInfo = await client.callTool({
  name: 'get_video_info',
  arguments: { url: 'https://youtu.be/ymMrAb8qvAo' }
});
console.log(`Video: ${videoInfo.title}, Duration: ${videoInfo.duration}s`);

// 2. Chạy pipeline (trả về ngay)
const pipeline = await client.callTool({
  name: 'run_full_pipeline',
  arguments: {
    videoUrl: 'https://youtu.be/ymMrAb8qvAo',
    basePath: 'C:/Videos/LongTieng',
    projectName: '20260514-yt-Never-Seen-So-Many-Fish-33m11s',
    targetLang: 'vi',
    sourceLang: 'auto',
    whisperEngine: 'whisper-openblas',
    backgroundVolume: 0.10
  }
});
console.log(`Pipeline started: ${pipeline.runId}`);

// 3. Poll tiến độ (mỗi 30 giây)
setInterval(async () => {
  const status = await client.callTool({
    name: 'get_pipeline_status',
    arguments: { projectPath: pipeline.projectPath }
  });
  console.log(`Status: ${status.status}, Step: ${status.currentStep}, Progress: ${status.stepProgress}%`);
  
  if (status.status === 'done') {
    console.log(`Final video: ${status.finalVideoPath}`);
    clearInterval(this);
  }
}, 30000);
```

### Ví dụ 2: Workflow từng bước (Step-by-step)

```typescript
// Bước 1: Tạo project
const project = await client.callTool({
  name: 'create_project',
  arguments: {
    basePath: 'C:/Videos/LongTieng',
    projectName: '20260514-yt-My-Video-10m30s'
  }
});
console.log(`Project created: ${project.projectPath}`);

// Bước 2: Download video
await client.callTool({
  name: 'download_video_to_project',
  arguments: {
    projectPath: project.projectPath,
    videoUrl: 'https://youtu.be/VIDEO_ID'
  }
});
console.log('Video downloaded');

// Bước 3: Transcribe
await client.callTool({
  name: 'transcribe_project',
  arguments: {
    projectPath: project.projectPath,
    engine: 'whisper-openblas',
    language: 'auto'
  }
});
console.log('Transcription completed');

// Bước 4: Translate
await client.callTool({
  name: 'translate_project_srt',
  arguments: {
    projectPath: project.projectPath,
    targetLang: 'vi'
  }
});
console.log('Translation completed');

// Bước 5: Generate audio
await client.callTool({
  name: 'generate_project_audio',
  arguments: {
    projectPath: project.projectPath,
    targetLang: 'vi',
    voiceId: 'vi-VN-NamMinhNeural' // Optional, auto-detect if not provided
  }
});
console.log('Audio generation completed');

// Bước 6: Create final video
const result = await client.callTool({
  name: 'create_project_final_video',
  arguments: {
    projectPath: project.projectPath,
    targetLang: 'vi',
    backgroundVolume: 0.10
  }
});
console.log(`Final video: ${result.finalVideoPath}`);
```

### Ví dụ 3: Sử dụng trong OpenCode
Trong OpenCode, bạn chỉ cần nói với AI:

```
Lồng tiếng video này sang tiếng Việt: https://youtu.be/ymMrAb8qvAo
```

OpenCode sẽ tự động:
1. Gọi `get_video_info` để lấy metadata
2. Tạo project name theo format `YYYYMMDD-platform-title-duration`
3. Gọi `run_full_pipeline` với thông số mặc định
4. Poll `get_pipeline_status` định kỳ để cập nhật tiến độ
5. Thông báo khi hoàn tất

---

## 🔧 Troubleshooting

### Server không khởi động

**Triệu chứng:** `npm run mcp:start` không có output hoặc lỗi

**Giải pháp:**
1. Kiểm tra port 3000 có bị chiếm:
   ```bash
   # Windows
   netstat -ano | findstr :3000
   
   # Linux/macOS
   lsof -i :3000
   ```

2. Kill process đang chiếm port:
   ```bash
   # Windows
   taskkill /PID <PID> /F
   
   # Linux/macOS
   kill -9 <PID>
   ```

3. Rebuild và restart:
   ```bash
   npm run mcp:build
   npm run mcp:start
   ```

### AI tool không thấy MCP server

**Triệu chứng:** OpenCode/Claude không list được tools

**Giải pháp:**
1. Kiểm tra server đang chạy:
   ```bash
   curl http://localhost:3000/health
   # Expected: {"status":"ok","mcp":false}
   ```

2. Kiểm tra config file:
   - Đúng đường dẫn file
   - Đúng format JSON (không có trailing comma)
   - URL đúng: `http://localhost:3000/mcp`
   - Type đúng: `"sse"`

3. Restart AI tool sau khi sửa config

4. Kiểm tra log của AI tool (nếu có)

### Pipeline bị stuck

**Triệu chứng:** `get_pipeline_status` trả về status "running" mãi không đổi

**Giải pháp:**
1. Kiểm tra log files:
   ```
   Windows: C:\Users\<USER>\AppData\Local\Temp\opencode\mcp-clean-out.log
            C:\Users\<USER>\AppData\Local\Temp\opencode\mcp-clean-err.log
   
   Linux/macOS: /tmp/opencode/mcp-clean-out.log
                /tmp/opencode/mcp-clean-err.log
   ```

2. Kiểm tra pipeline-status.json trong project folder:
   ```bash
   cat "C:/Videos/LongTieng/<project-name>/pipeline-status.json"
   ```

3. Cancel pipeline:
   ```typescript
   await client.callTool({ name: 'cancel_pipeline', arguments: {} });
   ```

4. Restart MCP server nếu cần

### Video download thất bại

**Triệu chứng:** Pipeline fail ở bước "download_video"

**Giải pháp:**
1. Kiểm tra URL video hợp lệ và accessible
2. Kiểm tra kết nối internet
3. Thử lại (có thể là lỗi mạng tạm thời)
4. Kiểm tra yt-dlp version:
   ```bash
   yt-dlp --version
   # Nên >= 2024.11.0
   ```
5. Update yt-dlp nếu cần:
   ```bash
   yt-dlp -U
   ```

### Transcribe thất bại

**Triệu chứng:** Pipeline fail ở bước "transcribe"

**Giải pháp:**
1. Kiểm tra Whisper engine có sẵn:
   ```typescript
   await client.callTool({ name: 'list_whisper_models', arguments: {} });
   ```

2. Kiểm tra Python và WhisperX đã cài:
   ```bash
   python --version  # >= 3.8
   pip show whisperx
   ```

3. Cài WhisperX nếu chưa có:
   ```bash
   pip install whisperx
   ```

4. Thử engine khác:
   - `whisper-cpu` (mặc định, chậm nhưng ổn định)
   - `whisper-openblas` (nhanh hơn CPU)
   - `whisper-gpu` (nhanh nhất, cần NVIDIA GPU + CUDA)

### Duration mismatch error

**Triệu chứng:** Pipeline fail với lỗi "Chunk X duration mismatch"

**Giải pháp:**
- Lỗi này đã được fix trong version hiện tại (tolerance tăng lên 0.3s và non-fatal)
- Nếu vẫn gặp, rebuild MCP server:
  ```bash
  npm run mcp:build
  npm run mcp:start
  ```

### Out of memory

**Triệu chứng:** Pipeline crash khi xử lý video dài (>30 phút)

**Giải pháp:**
1. Đóng các ứng dụng khác để giải phóng RAM
2. Giảm concurrency trong audio processing (mặc định: 10)
3. Sử dụng video quality thấp hơn (720p thay vì 1080p)
4. Nâng cấp RAM nếu có thể (khuyến nghị >= 16GB)

---

## ⚙️ Cấu hình nâng cao

### Thay đổi Whisper Engine mặc định

Mặc định hiện tại: `whisper-openblas`

Để thay đổi, sửa file `src/services/PipelineOrchestrator.ts`:
```typescript
async transcribeProject(
  projectPath: string, 
  engine: TranscriptEngine = "whisper-gpu", // Thay đổi ở đây
  language = "auto", 
  onProgress?: ProgressCallback
) {
  // ...
}
```

Sau đó rebuild:
```bash
npm run mcp:build
```

### Thay đổi Voice mặc định

Mặc định cho tiếng Việt: `vi-VN-NamMinhNeural` (giọng nam)

Để thay đổi, sửa file `src/services/tts/VoiceCatalog.ts`:
```typescript
export const DEFAULT_VOICE_MAP: Record<string, string> = {
  vi: 'vi-VN-HoaiMyNeural', // Giọng nữ
  // ...
};
```

Danh sách giọng tiếng Việt:
- `vi-VN-NamMinhNeural` (Nam)
- `vi-VN-HoaiMyNeural` (Nữ)
- `vi-VN-HoangLongNeural` (Nam)
- `vi-VN-ThanhTamNeural` (Nữ)
- `vi-VN-DuyHungNeural` (Nam)

### Thay đổi Background Volume mặc định

Mặc định: 10% (0.10)

Trong `run_full_pipeline`, truyền tham số `backgroundVolume`:
```typescript
{
  backgroundVolume: 0.15  // 15%
}
```

Hoặc sửa default trong code tại `src/services/PipelineOrchestrator.ts`:
```typescript
async createProjectFinalVideo(
  projectPath: string, 
  targetLang: string, 
  backgroundVolume = 0.15, // Thay đổi ở đây
  onProgress?: ProgressCallback
) {
  // ...
}
```

---

## 📊 Thông số kỹ thuật

### Hiệu năng

| Video Duration | Transcribe (CPU) | Transcribe (GPU) | Total Pipeline |
|----------------|------------------|------------------|----------------|
| 5 phút | ~3 phút | ~1 phút | ~8-10 phút |
| 15 phút | ~8 phút | ~2 phút | ~20-25 phút |
| 33 phút | ~15 phút | ~4 phút | ~40-50 phút |

*Lưu ý: Thời gian thực tế phụ thuộc vào CPU/GPU, tốc độ mạng, và độ phức tạp của audio.*

### Yêu cầu hệ thống

**Tối thiểu:**
- CPU: Intel i5 hoặc tương đương
- RAM: 8GB
- Disk: 5GB trống (cho mỗi video 30 phút)
- Network: Broadband (cho download video)

**Khuyến nghị:**
- CPU: Intel i7/Ryzen 7 hoặc cao hơn
- RAM: 16GB
- GPU: NVIDIA RTX 3060 hoặc cao hơn (cho whisper-gpu)
- Disk: SSD với 20GB+ trống
- Network: 50Mbps+

### Giới hạn

- **Max video duration:** Không giới hạn (đã test với video 33 phút)
- **Max concurrent pipelines:** 1 (queue limiter)
- **Max file size:** Phụ thuộc vào disk space
- **Supported platforms:** YouTube, Facebook, TikTok, và các platform khác mà yt-dlp hỗ trợ

---

## 📚 Tài liệu tham khảo

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [OpenCode MCP Documentation](https://opencode.ai/docs/mcp)
- [MCP SDK (TypeScript)](https://github.com/modelcontextprotocol/typescript-sdk)
- [Edge TTS Voices](https://speech.microsoft.com/portal/voicegallery)
- [WhisperX Documentation](https://github.com/m-bain/whisperX)
- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)

---

## 🆘 Hỗ trợ

Nếu gặp vấn đề, vui lòng:

1. **Kiểm tra log files:**
   - `mcp-clean-out.log` - stdout của MCP server
   - `mcp-clean-err.log` - stderr của MCP server
   - `pipeline-status.json` - trạng thái pipeline trong project folder

2. **Kiểm tra health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Mở issue trên GitHub repository** với thông tin:
   - OS và version
   - Node.js version
   - Log files
   - Các bước tái hiện lỗi

---

## 📝 Changelog

### v1.0.0 (2026-05-14)
- ✅ Initial MCP server implementation
- ✅ 19 MCP tools
- ✅ Async pipeline with status polling
- ✅ Queue limiter (1 concurrent pipeline)
- ✅ Duration mismatch fix (tolerance 0.3s, non-fatal)
- ✅ Default whisper engine: whisper-openblas
- ✅ Edge TTS integration (vi-VN-NamMinhNeural default)
- ✅ GPU encoding support (h264_amf for AMD, h264_nvenc for NVIDIA)