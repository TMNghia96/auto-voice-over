import path from "path";
import fs from "fs";
import { addProject } from "./DatabaseService";
import { createProjectFolder, getApiKey, getActivePromptId, getPrompts } from "./ConfigService";
import { downloadVideo } from "./VideoService";
import { transcribeAudio, TranscriptEngine } from "./TranscriptService";
import { createFinalVideo } from "./FinalVideoService";
import { generateAllAudio } from "./PiperService";
import { parseSrt, stringifySrt, TARGET_LANGUAGES } from "../lib/utils";
import { SrtRepository } from "./tts/SrtRepository";
import { TtsOutputManager } from "./tts/TtsOutputManager";
import { loadProjectConfig } from "./ProjectConfig";

export const PIPELINE_STEPS = ["create_project", "download_video", "transcribe", "translate", "generate_audio", "create_final_video"] as const;
export type PipelineStep = typeof PIPELINE_STEPS[number];

export interface PipelineOptions {
  videoUrl: string;
  basePath: string;
  projectName: string;
  targetLang: string;
  sourceLang?: string;
  whisperEngine?: TranscriptEngine;
  formatId?: string;
  voiceId?: string;
  backgroundVolume?: number;
  fadeDuration?: number;
}

export interface PipelineResult {
  success: boolean;
  runId: string;
  projectPath?: string;
  finalVideoPath?: string;
  failedStep?: PipelineStep;
  error?: string;
  artifacts: Record<string, string>;
}

export interface PipelineStatus {
  runId: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  steps: readonly string[];
  completedSteps: string[];
  currentStep: string;
  stepProgress: number;
  detail: string;
  projectPath?: string;
  projectName?: string;
  finalVideoPath?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  artifacts: Record<string, string>;
}

type ProgressCallback = (step: PipelineStep, progress: number, detail: string) => void;

const makeRunId = () => `run-${Date.now()}`;

const fail = (runId: string, step: PipelineStep, error: unknown, projectPath?: string, artifacts: Record<string, string> = {}): PipelineResult => ({
  success: false,
  runId,
  projectPath,
  failedStep: step,
  error: error instanceof Error ? error.message : String(error),
  artifacts,
});

const STATUS_FILE = "pipeline-status.json";

export class PipelineOrchestrator {
  private activeRunId: string | null = null;
  private abortController: AbortController | null = null;

  get isActive() {
    return this.activeRunId !== null;
  }

  get currentRunId() {
    return this.activeRunId;
  }

  private writeStatus(projectPath: string, status: PipelineStatus) {
    const dir = path.dirname(path.join(projectPath, STATUS_FILE));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(projectPath, STATUS_FILE), JSON.stringify(status, null, 2), "utf-8");
  }

  readStatus(projectPath: string): PipelineStatus | null {
    const file = path.join(projectPath, STATUS_FILE);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return null;
    }
  }

  cancelPipeline() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private buildInitialStatus(runId: string, options: PipelineOptions, projectPath: string): PipelineStatus {
    return {
      runId,
      status: "running",
      steps: PIPELINE_STEPS as unknown as string[],
      completedSteps: [],
      currentStep: "create_project",
      stepProgress: 0,
      detail: "Khởi tạo...",
      projectPath,
      projectName: options.projectName,
      startedAt: new Date().toISOString(),
      artifacts: {},
    };
  }

  async createProject(basePath: string, projectName: string) {
    const ok = createProjectFolder(basePath, projectName);
    if (!ok) throw new Error(`Không thể tạo project: ${projectName}`);

    const projectPath = path.join(basePath, projectName);
    const project = addProject({
      id: Date.now().toString(),
      name: projectName,
      path: projectPath,
      pinned: false,
    });
    if (!project) throw new Error("Không thể lưu project vào database");
    return { projectPath, project };
  }

  async downloadProjectVideo(videoUrl: string, projectPath: string, formatId?: string, onProgress?: ProgressCallback) {
    const ok = await downloadVideo(videoUrl, projectPath, (progress) => {
      const percent = Math.round((progress.video + progress.audio) / 2);
      onProgress?.("download_video", percent, `video ${progress.video}% audio ${progress.audio}%`);
    }, formatId);
    if (!ok) throw new Error("Tải video thất bại");
    return true;
  }

  async transcribeProject(projectPath: string, engine: TranscriptEngine = "whisper-openblas", language = "auto", onProgress?: ProgressCallback) {
    const result = await transcribeAudio(projectPath, (progress) => {
      onProgress?.("transcribe", Math.round(progress.progress), progress.detail);
    }, engine, language);
    if (!result) throw new Error("Tạo phụ đề thất bại");
    return result;
  }

  async translateProject(projectPath: string, targetLang: string, onProgress?: ProgressCallback) {
    const repo = new SrtRepository(projectPath);
    const existing = repo.load(targetLang);
    if (existing) return repo.srtPath(targetLang);

    const source = this.loadSourceSrt(projectPath);
    const entries = parseSrt(source);
    if (entries.length === 0) throw new Error("Không tìm thấy segment SRT để dịch");

    const apiKey = getApiKey("deepseek");
    if (!apiKey) throw new Error("Thiếu DeepSeek API key trong config");

    const langName = TARGET_LANGUAGES.find((lang) => lang.code === targetLang)?.name || targetLang;
    const prompts = getPrompts();
    const activePromptId = getActivePromptId();
    const promptConfig = prompts.find((prompt) => prompt.id === activePromptId) || prompts[0];
    const systemPrompt = `Translate subtitle segments to ${langName}.

FORMAT RULES:
- Each segment is separated by "---"
- Return ONLY the translated segments separated by "---", nothing else
- Preserve the same number of segments
- Do NOT add any extra text, explanation, or numbering

${promptConfig?.systemPrompt || ""}`.trim();

    const batchSize = 20;
    const translated = new Map<number, string>();
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const body = JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: batch.map((entry) => entry.text).join("\n---\n") },
        ],
        temperature: 0.3,
      });

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
      });
      if (!response.ok) throw new Error(await response.text());

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const parts = (data.choices?.[0]?.message?.content || "").split(/\n?---\n?/);
      batch.forEach((entry, index) => translated.set(entry.index, parts[index]?.trim() || entry.text));
      onProgress?.("translate", Math.round(Math.min(entries.length, i + batch.length) / entries.length * 100), `Đã dịch ${Math.min(entries.length, i + batch.length)}/${entries.length}`);
    }

    const result = stringifySrt(entries.map((entry) => ({ ...entry, text: translated.get(entry.index) || entry.text })));
    return repo.save(targetLang, result);
  }

  async generateProjectAudio(projectPath: string, targetLang: string, voiceId?: string, onProgress?: ProgressCallback) {
    const repo = new SrtRepository(projectPath);
    const srt = repo.load(targetLang);
    if (!srt) throw new Error(`Không tìm thấy SRT đã dịch: ${targetLang}`);

    const entries = parseSrt(srt);
    if (entries.length === 0) throw new Error("SRT đã dịch không có segment");

    const output = new TtsOutputManager(projectPath);
    output.clearSegments();
    output.ensureExists();
    const config = loadProjectConfig(projectPath);
    const concurrency = config.concurrencySettings?.initial ?? 10;

    const results = await generateAllAudio(
      entries.map((entry) => ({ index: entry.index, text: entry.text })),
      targetLang,
      output.dir,
      (progress) => onProgress?.("generate_audio", Math.round(progress.progress), progress.detail),
      concurrency,
      voiceId,
    );
    const successCount = results.filter(Boolean).length;
    if (successCount !== entries.length) throw new Error(`Tạo audio thiếu segment: ${successCount}/${entries.length}`);
    return output.dir;
  }

  async createProjectFinalVideo(projectPath: string, targetLang: string, backgroundVolume = 0.15, onProgress?: ProgressCallback) {
    const result = await createFinalVideo(projectPath, (progress) => {
      onProgress?.("create_final_video", Math.round(progress.progress), progress.detail);
    }, backgroundVolume, { lang: targetLang });
    if (!result) throw new Error("Tạo final video thất bại");
    return result;
  }

  /** Synchronous – used internally by startPipeline. Still available if anyone needs blocking call. */
  async runFullPipeline(options: PipelineOptions, onProgress?: ProgressCallback): Promise<PipelineResult> {
    const runId = makeRunId();
    const artifacts: Record<string, string> = {};
    let projectPath: string | undefined;

    try {
      onProgress?.("create_project", 0, "Đang tạo project");
      const created = await this.createProject(options.basePath, options.projectName);
      projectPath = created.projectPath;
      fs.writeFileSync(path.join(projectPath, "url.txt"), options.videoUrl, "utf-8");
      artifacts.projectPath = projectPath;
      onProgress?.("create_project", 100, "Đã tạo project");
    } catch (error) {
      return fail(runId, "create_project", error, projectPath, artifacts);
    }

    try {
      await this.downloadProjectVideo(options.videoUrl, projectPath, options.formatId, onProgress);
      artifacts.original = path.join(projectPath, "original");
    } catch (error) {
      return fail(runId, "download_video", error, projectPath, artifacts);
    }

    try {
      const transcript = await this.transcribeProject(projectPath, options.whisperEngine, options.sourceLang || "auto", onProgress);
      artifacts.transcript = transcript.srtPath;
    } catch (error) {
      return fail(runId, "transcribe", error, projectPath, artifacts);
    }

    try {
      artifacts.translation = await this.translateProject(projectPath, options.targetLang, onProgress);
    } catch (error) {
      return fail(runId, "translate", error, projectPath, artifacts);
    }

    try {
      artifacts.audio = await this.generateProjectAudio(projectPath, options.targetLang, options.voiceId, onProgress);
    } catch (error) {
      return fail(runId, "generate_audio", error, projectPath, artifacts);
    }

    try {
      const finalVideoPath = await this.createProjectFinalVideo(projectPath, options.targetLang, options.backgroundVolume, onProgress);
      artifacts.finalVideo = finalVideoPath;
      return { success: true, runId, projectPath, finalVideoPath, artifacts };
    } catch (error) {
      return fail(runId, "create_final_video", error, projectPath, artifacts);
    }
  }

  /** Fire-and-forget: returns runId immediately, writes status to project folder. */
  startPipeline(options: PipelineOptions): { accepted: boolean; runId?: string; reason?: string; projectName?: string; projectPath?: string } {
    if (this.activeRunId !== null) {
      return { accepted: false, reason: `Đang có pipeline đang chạy (${this.activeRunId}). Vui lòng chờ.` };
    }

    const runId = makeRunId();
    const projectPath = path.join(options.basePath, options.projectName);

    const status = this.buildInitialStatus(runId, options, "");
    this.activeRunId = runId;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    (async () => {
      try {
        for (const step of PIPELINE_STEPS) {
          if (signal.aborted) {
            status.status = "cancelled";
            status.detail = "Đã hủy bởi người dùng.";
            status.finishedAt = new Date().toISOString();
            if (status.projectPath) this.writeStatus(status.projectPath, status);
            return;
          }

          status.currentStep = step;
          status.stepProgress = 0;
          status.detail = `Đang chạy bước ${step}...`;
          if (status.projectPath) this.writeStatus(status.projectPath, status);

          const onProgress: ProgressCallback = (s, p, d) => {
            if (signal.aborted) return;
            status.stepProgress = p;
            status.detail = d;
            this.writeStatus(projectPath, status);
          };

          switch (step) {
            case "create_project": {
              const created = await this.createProject(options.basePath, options.projectName);
              const pp = created.projectPath;
              fs.writeFileSync(path.join(pp, "url.txt"), options.videoUrl, "utf-8");
              status.artifacts.projectPath = pp;
              status.projectPath = pp;
              status.stepProgress = 100;
              status.completedSteps.push(step);
              this.writeStatus(projectPath, status);
              break;
            }
            case "download_video": {
              await this.downloadProjectVideo(options.videoUrl, projectPath, options.formatId, onProgress);
              status.artifacts.original = path.join(projectPath, "original");
              status.stepProgress = 100;
              status.completedSteps.push(step);
              this.writeStatus(projectPath, status);
              break;
            }
            case "transcribe": {
              const transcript = await this.transcribeProject(projectPath, options.whisperEngine, options.sourceLang || "auto", onProgress);
              status.artifacts.transcript = transcript.srtPath;
              status.stepProgress = 100;
              status.completedSteps.push(step);
              this.writeStatus(projectPath, status);
              break;
            }
            case "translate": {
              const translationPath = await this.translateProject(projectPath, options.targetLang, onProgress);
              status.artifacts.translation = translationPath;
              status.stepProgress = 100;
              status.completedSteps.push(step);
              this.writeStatus(projectPath, status);
              break;
            }
            case "generate_audio": {
              const audioDir = await this.generateProjectAudio(projectPath, options.targetLang, options.voiceId, onProgress);
              status.artifacts.audio = audioDir;
              status.stepProgress = 100;
              status.completedSteps.push(step);
              this.writeStatus(projectPath, status);
              break;
            }
            case "create_final_video": {
              const finalVideoPath = await this.createProjectFinalVideo(projectPath, options.targetLang, options.backgroundVolume, onProgress);
              status.artifacts.finalVideo = finalVideoPath;
              status.finalVideoPath = finalVideoPath;
              status.stepProgress = 100;
              status.completedSteps.push(step);
              this.writeStatus(projectPath, status);
              break;
            }
          }
        }

        status.status = "done";
        status.detail = "Hoàn tất pipeline!";
        status.finishedAt = new Date().toISOString();
        this.writeStatus(projectPath, status);
      } catch (error) {
        if (signal.aborted) {
          status.status = "cancelled";
          status.detail = "Đã hủy bởi người dùng.";
        } else {
          status.status = "failed";
          status.error = error instanceof Error ? error.message : String(error);
          status.detail = `Lỗi tại bước ${status.currentStep}: ${status.error}`;
        }
        status.finishedAt = new Date().toISOString();
        try { this.writeStatus(projectPath, status); } catch {}
      } finally {
        this.activeRunId = null;
        this.abortController = null;
      }
    })();

    return { accepted: true, runId, projectName: options.projectName, projectPath };
  }

  private loadSourceSrt(projectPath: string) {
    const transcriptDir = path.join(projectPath, "transcript");
    const srtFile = fs.existsSync(transcriptDir) ? fs.readdirSync(transcriptDir).find((file) => file.endsWith(".srt")) : null;
    if (!srtFile) throw new Error("Không tìm thấy SRT gốc trong transcript");
    return fs.readFileSync(path.join(transcriptDir, srtFile), "utf-8");
  }
}

export const pipelineOrchestrator = new PipelineOrchestrator();
