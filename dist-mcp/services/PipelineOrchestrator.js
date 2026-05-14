"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipelineOrchestrator = exports.PipelineOrchestrator = exports.PIPELINE_STEPS = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const DatabaseService_1 = require("./DatabaseService");
const ConfigService_1 = require("./ConfigService");
const VideoService_1 = require("./VideoService");
const TranscriptService_1 = require("./TranscriptService");
const FinalVideoService_1 = require("./FinalVideoService");
const PiperService_1 = require("./PiperService");
const utils_1 = require("../lib/utils");
const SrtRepository_1 = require("./tts/SrtRepository");
const TtsOutputManager_1 = require("./tts/TtsOutputManager");
const ProjectConfig_1 = require("./ProjectConfig");
exports.PIPELINE_STEPS = ["create_project", "download_video", "transcribe", "translate", "generate_audio", "create_final_video"];
const makeRunId = () => `run-${Date.now()}`;
const fail = (runId, step, error, projectPath, artifacts = {}) => ({
    success: false,
    runId,
    projectPath,
    failedStep: step,
    error: error instanceof Error ? error.message : String(error),
    artifacts,
});
const STATUS_FILE = "pipeline-status.json";
class PipelineOrchestrator {
    activeRunId = null;
    abortController = null;
    get isActive() {
        return this.activeRunId !== null;
    }
    get currentRunId() {
        return this.activeRunId;
    }
    writeStatus(projectPath, status) {
        const dir = path_1.default.dirname(path_1.default.join(projectPath, STATUS_FILE));
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(projectPath, STATUS_FILE), JSON.stringify(status, null, 2), "utf-8");
    }
    readStatus(projectPath) {
        const file = path_1.default.join(projectPath, STATUS_FILE);
        if (!fs_1.default.existsSync(file))
            return null;
        try {
            return JSON.parse(fs_1.default.readFileSync(file, "utf-8"));
        }
        catch {
            return null;
        }
    }
    cancelPipeline() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
    buildInitialStatus(runId, options, projectPath) {
        return {
            runId,
            status: "running",
            steps: exports.PIPELINE_STEPS,
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
    async createProject(basePath, projectName) {
        const ok = (0, ConfigService_1.createProjectFolder)(basePath, projectName);
        if (!ok)
            throw new Error(`Không thể tạo project: ${projectName}`);
        const projectPath = path_1.default.join(basePath, projectName);
        const project = (0, DatabaseService_1.addProject)({
            id: Date.now().toString(),
            name: projectName,
            path: projectPath,
            pinned: false,
        });
        if (!project)
            throw new Error("Không thể lưu project vào database");
        return { projectPath, project };
    }
    async downloadProjectVideo(videoUrl, projectPath, formatId, onProgress) {
        const ok = await (0, VideoService_1.downloadVideo)(videoUrl, projectPath, (progress) => {
            const percent = Math.round((progress.video + progress.audio) / 2);
            onProgress?.("download_video", percent, `video ${progress.video}% audio ${progress.audio}%`);
        }, formatId);
        if (!ok)
            throw new Error("Tải video thất bại");
        return true;
    }
    async transcribeProject(projectPath, engine = "whisper-openblas", language = "auto", onProgress) {
        const result = await (0, TranscriptService_1.transcribeAudio)(projectPath, (progress) => {
            onProgress?.("transcribe", Math.round(progress.progress), progress.detail);
        }, engine, language);
        if (!result)
            throw new Error("Tạo phụ đề thất bại");
        return result;
    }
    async translateProject(projectPath, targetLang, onProgress) {
        const repo = new SrtRepository_1.SrtRepository(projectPath);
        const existing = repo.load(targetLang);
        if (existing)
            return repo.srtPath(targetLang);
        const source = this.loadSourceSrt(projectPath);
        const entries = (0, utils_1.parseSrt)(source);
        if (entries.length === 0)
            throw new Error("Không tìm thấy segment SRT để dịch");
        const apiKey = (0, ConfigService_1.getApiKey)("deepseek");
        if (!apiKey)
            throw new Error("Thiếu DeepSeek API key trong config");
        const langName = utils_1.TARGET_LANGUAGES.find((lang) => lang.code === targetLang)?.name || targetLang;
        const prompts = (0, ConfigService_1.getPrompts)();
        const activePromptId = (0, ConfigService_1.getActivePromptId)();
        const promptConfig = prompts.find((prompt) => prompt.id === activePromptId) || prompts[0];
        const systemPrompt = `Translate subtitle segments to ${langName}.

FORMAT RULES:
- Each segment is separated by "---"
- Return ONLY the translated segments separated by "---", nothing else
- Preserve the same number of segments
- Do NOT add any extra text, explanation, or numbering

${promptConfig?.systemPrompt || ""}`.trim();
        const batchSize = 20;
        const translated = new Map();
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
            if (!response.ok)
                throw new Error(await response.text());
            const data = await response.json();
            const parts = (data.choices?.[0]?.message?.content || "").split(/\n?---\n?/);
            batch.forEach((entry, index) => translated.set(entry.index, parts[index]?.trim() || entry.text));
            onProgress?.("translate", Math.round(Math.min(entries.length, i + batch.length) / entries.length * 100), `Đã dịch ${Math.min(entries.length, i + batch.length)}/${entries.length}`);
        }
        const result = (0, utils_1.stringifySrt)(entries.map((entry) => ({ ...entry, text: translated.get(entry.index) || entry.text })));
        return repo.save(targetLang, result);
    }
    async generateProjectAudio(projectPath, targetLang, voiceId, onProgress) {
        const repo = new SrtRepository_1.SrtRepository(projectPath);
        const srt = repo.load(targetLang);
        if (!srt)
            throw new Error(`Không tìm thấy SRT đã dịch: ${targetLang}`);
        const entries = (0, utils_1.parseSrt)(srt);
        if (entries.length === 0)
            throw new Error("SRT đã dịch không có segment");
        const output = new TtsOutputManager_1.TtsOutputManager(projectPath);
        output.clearSegments();
        output.ensureExists();
        const config = (0, ProjectConfig_1.loadProjectConfig)(projectPath);
        const concurrency = config.concurrencySettings?.initial ?? 10;
        const results = await (0, PiperService_1.generateAllAudio)(entries.map((entry) => ({ index: entry.index, text: entry.text })), targetLang, output.dir, (progress) => onProgress?.("generate_audio", Math.round(progress.progress), progress.detail), concurrency, voiceId);
        const successCount = results.filter(Boolean).length;
        if (successCount !== entries.length)
            throw new Error(`Tạo audio thiếu segment: ${successCount}/${entries.length}`);
        return output.dir;
    }
    async createProjectFinalVideo(projectPath, targetLang, backgroundVolume = 0.15, onProgress) {
        const result = await (0, FinalVideoService_1.createFinalVideo)(projectPath, (progress) => {
            onProgress?.("create_final_video", Math.round(progress.progress), progress.detail);
        }, backgroundVolume, { lang: targetLang });
        if (!result)
            throw new Error("Tạo final video thất bại");
        return result;
    }
    /** Synchronous – used internally by startPipeline. Still available if anyone needs blocking call. */
    async runFullPipeline(options, onProgress) {
        const runId = makeRunId();
        const artifacts = {};
        let projectPath;
        try {
            onProgress?.("create_project", 0, "Đang tạo project");
            const created = await this.createProject(options.basePath, options.projectName);
            projectPath = created.projectPath;
            fs_1.default.writeFileSync(path_1.default.join(projectPath, "url.txt"), options.videoUrl, "utf-8");
            artifacts.projectPath = projectPath;
            onProgress?.("create_project", 100, "Đã tạo project");
        }
        catch (error) {
            return fail(runId, "create_project", error, projectPath, artifacts);
        }
        try {
            await this.downloadProjectVideo(options.videoUrl, projectPath, options.formatId, onProgress);
            artifacts.original = path_1.default.join(projectPath, "original");
        }
        catch (error) {
            return fail(runId, "download_video", error, projectPath, artifacts);
        }
        try {
            const transcript = await this.transcribeProject(projectPath, options.whisperEngine, options.sourceLang || "auto", onProgress);
            artifacts.transcript = transcript.srtPath;
        }
        catch (error) {
            return fail(runId, "transcribe", error, projectPath, artifacts);
        }
        try {
            artifacts.translation = await this.translateProject(projectPath, options.targetLang, onProgress);
        }
        catch (error) {
            return fail(runId, "translate", error, projectPath, artifacts);
        }
        try {
            artifacts.audio = await this.generateProjectAudio(projectPath, options.targetLang, options.voiceId, onProgress);
        }
        catch (error) {
            return fail(runId, "generate_audio", error, projectPath, artifacts);
        }
        try {
            const finalVideoPath = await this.createProjectFinalVideo(projectPath, options.targetLang, options.backgroundVolume, onProgress);
            artifacts.finalVideo = finalVideoPath;
            return { success: true, runId, projectPath, finalVideoPath, artifacts };
        }
        catch (error) {
            return fail(runId, "create_final_video", error, projectPath, artifacts);
        }
    }
    /** Fire-and-forget: returns runId immediately, writes status to project folder. */
    startPipeline(options) {
        if (this.activeRunId !== null) {
            return { accepted: false, reason: `Đang có pipeline đang chạy (${this.activeRunId}). Vui lòng chờ.` };
        }
        const runId = makeRunId();
        const projectPath = path_1.default.join(options.basePath, options.projectName);
        const status = this.buildInitialStatus(runId, options, "");
        this.activeRunId = runId;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        (async () => {
            try {
                for (const step of exports.PIPELINE_STEPS) {
                    if (signal.aborted) {
                        status.status = "cancelled";
                        status.detail = "Đã hủy bởi người dùng.";
                        status.finishedAt = new Date().toISOString();
                        if (status.projectPath)
                            this.writeStatus(status.projectPath, status);
                        return;
                    }
                    status.currentStep = step;
                    status.stepProgress = 0;
                    status.detail = `Đang chạy bước ${step}...`;
                    if (status.projectPath)
                        this.writeStatus(status.projectPath, status);
                    const onProgress = (s, p, d) => {
                        if (signal.aborted)
                            return;
                        status.stepProgress = p;
                        status.detail = d;
                        this.writeStatus(projectPath, status);
                    };
                    switch (step) {
                        case "create_project": {
                            const created = await this.createProject(options.basePath, options.projectName);
                            const pp = created.projectPath;
                            fs_1.default.writeFileSync(path_1.default.join(pp, "url.txt"), options.videoUrl, "utf-8");
                            status.artifacts.projectPath = pp;
                            status.projectPath = pp;
                            status.stepProgress = 100;
                            status.completedSteps.push(step);
                            this.writeStatus(projectPath, status);
                            break;
                        }
                        case "download_video": {
                            await this.downloadProjectVideo(options.videoUrl, projectPath, options.formatId, onProgress);
                            status.artifacts.original = path_1.default.join(projectPath, "original");
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
            }
            catch (error) {
                if (signal.aborted) {
                    status.status = "cancelled";
                    status.detail = "Đã hủy bởi người dùng.";
                }
                else {
                    status.status = "failed";
                    status.error = error instanceof Error ? error.message : String(error);
                    status.detail = `Lỗi tại bước ${status.currentStep}: ${status.error}`;
                }
                status.finishedAt = new Date().toISOString();
                try {
                    this.writeStatus(projectPath, status);
                }
                catch { }
            }
            finally {
                this.activeRunId = null;
                this.abortController = null;
            }
        })();
        return { accepted: true, runId, projectName: options.projectName, projectPath };
    }
    loadSourceSrt(projectPath) {
        const transcriptDir = path_1.default.join(projectPath, "transcript");
        const srtFile = fs_1.default.existsSync(transcriptDir) ? fs_1.default.readdirSync(transcriptDir).find((file) => file.endsWith(".srt")) : null;
        if (!srtFile)
            throw new Error("Không tìm thấy SRT gốc trong transcript");
        return fs_1.default.readFileSync(path_1.default.join(transcriptDir, srtFile), "utf-8");
    }
}
exports.PipelineOrchestrator = PipelineOrchestrator;
exports.pipelineOrchestrator = new PipelineOrchestrator();
//# sourceMappingURL=PipelineOrchestrator.js.map