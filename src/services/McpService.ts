import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Existing imports
import { isEnvironmentReady, listWhisperModels, getWhisperDownloadStatus, downloadWhisperModel } from './EnvironmentService';
import { transcribeAudio, TranscriptEngine } from './TranscriptService';

// New imports
import { generateAudioSegment } from './PiperService';
import { getProjects } from './DatabaseService';
import { getVideoInfo } from './VideoService';
import { getHardwareInfo } from './HardwareService';
import { optimizeSrtFile } from '../lib/SrtOptimizer';
import { createFinalVideo } from './FinalVideoService';
import { pipelineOrchestrator } from './PipelineOrchestrator';
import { assertProjectRoot, assertSrtFile, assertWritablePathInRegisteredProject } from './PathSecurity';

export class McpService {
  private server: Server;
  private app: express.Application;
  private port: number = 3000;
  private transport: SSEServerTransport | null = null;
  private registeredTools: string[] = [];

  constructor() {
    this.app = express();
    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed'));
      },
    }));

    this.server = new Server(
      {
        name: 'auto-voice-over-tool-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    this.setupRoutes();

    // Dùng json() cho các route khác nếu có
    this.app.use(express.json());
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const fullToolsList = [
        {
          name: 'get_system_status',
          description: 'Kiểm tra trạng thái sẵn sàng của hệ thống (FFmpeg, Whisper, Handbrake, v.v.)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'list_whisper_models',
          description: 'Liệt kê danh sách các Whisper models hiện có và trạng thái download của chúng',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'transcribe_audio',
          description: 'Thực hiện chuyển đổi file âm thanh trong project thành văn bản (SRT)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Đường dẫn tuyệt đối tới thư mục project' },
              engine: { type: 'string', enum: ['whisper-cpu', 'whisper-gpu', 'whisper-openblas'], description: 'Công cụ nhận dạng' },
              language: { type: 'string', description: 'Mã ngôn ngữ' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'generate_voice',
          description: 'Tạo file âm thanh lồng tiếng từ một đoạn văn bản (Text to Speech)',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Nội dung văn bản' },
              voiceName: { type: 'string', description: 'Mã giọng đọc' },
              outputPath: { type: 'string', description: 'Đường dẫn file mp3 đầu ra' },
            },
            required: ['text', 'voiceName', 'outputPath'],
          },
        },
        {
          name: 'list_projects',
          description: 'Lấy danh sách các project hiện có trong cơ sở dữ liệu',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_video_info',
          description: 'Lấy thông tin của một video YouTube',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'URL video' } },
            required: ['url'],
          },
        },
        {
          name: 'get_gpu_info',
          description: 'Kiểm tra thông số phần cứng bao gồm CPU, RAM và GPU',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'download_model',
          description: 'Tải một model Whisper nếu máy chưa có',
          inputSchema: {
            type: 'object',
            properties: { modelId: { type: 'string', description: 'ID model' } },
            required: ['modelId'],
          },
        },
        {
          name: 'optimize_srt',
          description: 'Đọc và tối ưu hoá lại một file SRT.',
          inputSchema: {
            type: 'object',
            properties: { srtPath: { type: 'string', description: 'Đường dẫn file SRT' } },
            required: ['srtPath'],
          },
        },
        {
          name: 'merge_audio_video',
          description: 'Ghép nối tất cả âm thanh vào video để tạo file kết quả cuối cùng.',
          inputSchema: {
            type: 'object',
            properties: { projectPath: { type: 'string', description: 'Đường dẫn project' } },
            required: ['projectPath'],
          },
        },
        {
          name: 'create_project',
          description: 'Tạo project mới và lưu vào database.',
          inputSchema: {
            type: 'object',
            properties: {
              basePath: { type: 'string', description: 'Thư mục cha để tạo project' },
              projectName: { type: 'string', description: 'Tên project mới' },
            },
            required: ['basePath', 'projectName'],
          },
        },
        {
          name: 'download_video_to_project',
          description: 'Tải video/audio từ URL vào project.',
          inputSchema: {
            type: 'object',
            properties: {
              videoUrl: { type: 'string' },
              projectPath: { type: 'string' },
              formatId: { type: 'string' },
            },
            required: ['videoUrl', 'projectPath'],
          },
        },
        {
          name: 'transcribe_project',
          description: 'Tạo SRT gốc từ audio trong project.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              engine: { type: 'string', enum: ['whisper-cpu', 'whisper-gpu', 'whisper-openblas'] },
              language: { type: 'string' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'translate_project_srt',
          description: 'Dịch SRT gốc bằng DeepSeek config hiện tại và lưu translate/<lang>.srt.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              targetLang: { type: 'string' },
            },
            required: ['projectPath', 'targetLang'],
          },
        },
        {
          name: 'generate_project_audio',
          description: 'Tạo voice-over audio từ SRT đã dịch.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              targetLang: { type: 'string' },
              voiceId: { type: 'string' },
            },
            required: ['projectPath', 'targetLang'],
          },
        },
        {
          name: 'create_project_final_video',
          description: 'Render final video từ project đã có video, audio, SRT.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              targetLang: { type: 'string' },
              backgroundVolume: { type: 'number' },
            },
            required: ['projectPath', 'targetLang'],
          },
        },
        {
          name: 'run_full_pipeline',
          description: 'Chạy toàn bộ workflow bất đồng bộ: trả về runId ngay, pipeline chạy nền. Dùng get_pipeline_status để kiểm tra tiến độ.',
          inputSchema: {
            type: 'object',
            properties: {
              videoUrl: { type: 'string' },
              basePath: { type: 'string' },
              projectName: { type: 'string' },
              targetLang: { type: 'string' },
              sourceLang: { type: 'string' },
              whisperEngine: { type: 'string', enum: ['whisper-cpu', 'whisper-gpu', 'whisper-openblas'] },
              formatId: { type: 'string' },
              voiceId: { type: 'string' },
              backgroundVolume: { type: 'number' },
            },
            required: ['videoUrl', 'basePath', 'projectName', 'targetLang'],
          },
        },
        {
          name: 'get_pipeline_status',
          description: 'Đọc trạng thái pipeline từ file pipeline-status.json trong project folder.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Đường dẫn project (lấy từ runId/projectPath của run_full_pipeline)' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'cancel_pipeline',
          description: 'Hủy pipeline đang chạy. Chỉ hủy được pipeline gần nhất được start từ server này.',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      this.registeredTools = fullToolsList.map(t => t.name);

      return {
        tools: fullToolsList,
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_system_status': {
            const ready = isEnvironmentReady();
            const downloadStatus = getWhisperDownloadStatus();
            return {
              content: [{ type: 'text', text: JSON.stringify({ isReady: ready, whisperDownload: downloadStatus }, null, 2) }],
            };
          }

          case 'list_whisper_models': {
            const models = listWhisperModels();
            return {
              content: [{ type: 'text', text: JSON.stringify(models, null, 2) }],
            };
          }

          case 'transcribe_audio': {
            const { projectPath, engine, language } = args as any;
            const safeProjectPath = assertProjectRoot(projectPath);
            const result = await transcribeAudio(
              safeProjectPath,
              (progress) => { console.log(`[MCP Transcribe] ${progress.status}: ${progress.progress}%`); },
              engine || 'whisper-cpu',
              language || 'auto'
            );
            if (!result) throw new Error('Không thể thực hiện chuyển đổi âm thanh.');
            return {
              content: [{ type: 'text', text: JSON.stringify({ message: 'Thành công', srtPath: result.srtPath }, null, 2) }],
            };
          }

          case 'generate_voice': {
            const { text, voiceName, outputPath } = args as any;
            const safeOutputPath = assertWritablePathInRegisteredProject(outputPath);
            const success = await generateAudioSegment(text, voiceName, safeOutputPath);
            return {
              content: [{ type: 'text', text: success ? 'Tạo âm thanh thành công: ' + safeOutputPath : 'Lỗi khi tạo âm thanh.' }],
              isError: !success,
            };
          }

          case 'list_projects': {
            const projects = getProjects();
            return {
              content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
            };
          }

          case 'get_video_info': {
            const { url } = args as any;
            const info = await getVideoInfo(url);
            if (!info) throw new Error('Không lấy được thông tin video từ URL này.');
            return {
              content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
            };
          }

          case 'get_gpu_info': {
            const hw = await getHardwareInfo();
            return {
              content: [{ type: 'text', text: JSON.stringify(hw, null, 2) }],
            };
          }

          case 'download_model': {
            const { modelId } = args as any;
            const success = await downloadWhisperModel(modelId, (percent) => {
                console.log(`[MCP Download Model] ${modelId}: ${percent}%`);
            });
            return {
              content: [{ type: 'text', text: success ? 'Tải model thành công!' : 'Lỗi trong quá trình tải model.' }],
              isError: !success,
            };
          }

          case 'optimize_srt': {
            const { srtPath } = args as any;
            const resultContent = optimizeSrtFile(assertSrtFile(srtPath));
            return {
              content: [{ type: 'text', text: 'Tối ưu srt thành công!\nPreview:\n' + resultContent.substring(0, 500) }],
            };
          }

          case 'merge_audio_video': {
            const { projectPath } = args as any;
            const safeProjectPath = assertProjectRoot(projectPath);
            const resultPath = await createFinalVideo(safeProjectPath, (progress) => {
                console.log(`[MCP Merge Video] ${progress.status}: ${progress.progress}% - ${progress.detail}`);
            });
            if (!resultPath) throw new Error('Quá trình merge video gặp lỗi.');
            return {
              content: [{ type: 'text', text: `Đã đóng gói hoàn tất video tại: ${resultPath}` }],
            };
          }

          case 'create_project': {
            const { basePath, projectName } = args as any;
            const result = await pipelineOrchestrator.createProject(basePath, projectName);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'download_video_to_project': {
            const { videoUrl, projectPath, formatId } = args as any;
            const safeProjectPath = assertProjectRoot(projectPath);
            await pipelineOrchestrator.downloadProjectVideo(videoUrl, safeProjectPath, formatId, (step, progress, detail) => {
              console.log(`[MCP Pipeline] ${step}: ${progress}% - ${detail}`);
            });
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, projectPath: safeProjectPath }, null, 2) }] };
          }

          case 'transcribe_project': {
            const { projectPath, engine, language } = args as any;
            const safeProjectPath = assertProjectRoot(projectPath);
            const result = await pipelineOrchestrator.transcribeProject(safeProjectPath, engine, language || 'auto', (step, progress, detail) => {
              console.log(`[MCP Pipeline] ${step}: ${progress}% - ${detail}`);
            });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'translate_project_srt': {
            const { projectPath, targetLang } = args as any;
            const safeProjectPath = assertProjectRoot(projectPath);
            const srtPath = await pipelineOrchestrator.translateProject(safeProjectPath, targetLang, (step, progress, detail) => {
              console.log(`[MCP Pipeline] ${step}: ${progress}% - ${detail}`);
            });
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, srtPath }, null, 2) }] };
          }

          case 'generate_project_audio': {
            const { projectPath, targetLang, voiceId } = args as any;
            const safeProjectPath = assertProjectRoot(projectPath);
            const audioDir = await pipelineOrchestrator.generateProjectAudio(safeProjectPath, targetLang, voiceId, (step, progress, detail) => {
              console.log(`[MCP Pipeline] ${step}: ${progress}% - ${detail}`);
            });
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, audioDir }, null, 2) }] };
          }

          case 'create_project_final_video': {
            const { projectPath, targetLang, backgroundVolume } = args as any;
            const safeProjectPath = assertProjectRoot(projectPath);
            const finalVideoPath = await pipelineOrchestrator.createProjectFinalVideo(safeProjectPath, targetLang, backgroundVolume, (step, progress, detail) => {
              console.log(`[MCP Pipeline] ${step}: ${progress}% - ${detail}`);
            });
            return { content: [{ type: 'text', text: JSON.stringify({ success: true, finalVideoPath }, null, 2) }] };
          }

          case 'run_full_pipeline': {
            const pipelineArgs = args as any;
            const startResult = pipelineOrchestrator.startPipeline({
              ...pipelineArgs,
              projectPath: pipelineArgs.projectPath ? assertProjectRoot(pipelineArgs.projectPath) : pipelineArgs.projectPath,
            });
            if (!startResult.accepted) {
              return {
                content: [{ type: 'text', text: JSON.stringify(startResult, null, 2) }],
                isError: true,
              };
            }
            return {
              content: [{ type: 'text', text: JSON.stringify(startResult, null, 2) }],
            };
          }

          case 'get_pipeline_status': {
            const { projectPath } = args as any;
            const status = pipelineOrchestrator.readStatus(assertProjectRoot(projectPath));
            if (!status) {
              return {
                content: [{ type: 'text', text: JSON.stringify({ error: 'Không tìm thấy trạng thái pipeline cho project này.' }, null, 2) }],
                isError: true,
              };
            }
            return {
              content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
            };
          }

          case 'cancel_pipeline': {
            pipelineOrchestrator.cancelPipeline();
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Đã gửi yêu cầu hủy pipeline.' }, null, 2) }],
            };
          }

          default:
            throw new Error(`Tool không tồn tại: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Lỗi khi thực hiện tool ${name}: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  private setupRoutes() {
    this.app.get('/mcp', async (req, res) => {
      console.log('[MCP] New SSE connection request');
      this.transport = new SSEServerTransport('/events', res);
      await this.server.connect(this.transport);
    });

    this.app.post('/events', async (req, res) => {
      if (this.transport) {
        await this.transport.handlePostMessage(req, res);
      } else {
        res.status(404).send('No active MCP session');
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', mcp: !!this.transport });
    });
  }

  public getStatus() {
    return {
      isEnabled: true,
      port: this.port,
      endpoint: `http://localhost:${this.port}/mcp`,
      isClientConnected: !!this.transport,
      tools: this.registeredTools,
    };
  }

  public start() {
    try {
      const server = this.app.listen(this.port, 'localhost', () => {
        console.log(`[MCP Server] Đang chạy tại http://localhost:${this.port}/mcp`);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[MCP Server] Port ${this.port} is already in use. Failed to start.`);
        } else {
          console.error('[MCP Server] Error starting server:', err);
        }
      });
    } catch (error) {
      console.error('[MCP Server] Exception while starting:', error);
    }
  }
}

export const mcpService = new McpService();
