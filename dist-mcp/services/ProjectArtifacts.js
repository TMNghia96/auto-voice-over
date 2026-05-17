"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncProjectArtifactMetadata = exports.completedPhasesFromStatus = exports.inspectProjectPhases = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ConfigService_1 = require("./ConfigService");
const hasFile = (dir, pattern) => {
    if (!fs_1.default.existsSync(dir))
        return false;
    return fs_1.default.readdirSync(dir).some((file) => pattern.test(file));
};
const inspectProjectPhases = (projectPath) => {
    const videoDir = path_1.default.join(projectPath, "original", "video");
    const audioDir = path_1.default.join(projectPath, "original", "audio");
    const transcriptDir = path_1.default.join(projectPath, "transcript");
    const translateDir = path_1.default.join(projectPath, "translate");
    const generatedAudioDir = path_1.default.join(projectPath, "audio_gene");
    const finalVideoPath = path_1.default.join(projectPath, "final", "final_video.mp4");
    return {
        download: hasFile(videoDir, /\.(mp4|mkv|webm|avi|mov)$/i) && hasFile(audioDir, /\.(mp3|m4a|wav|opus|ogg|webm)$/i),
        transcript: hasFile(transcriptDir, /\.srt$/i),
        translate: hasFile(translateDir, /\.srt$/i),
        audio: hasFile(generatedAudioDir, /\.(mp3|wav)$/i),
        final: fs_1.default.existsSync(finalVideoPath),
    };
};
exports.inspectProjectPhases = inspectProjectPhases;
const completedPhasesFromStatus = (status) => {
    const completed = [];
    if (status.download)
        completed.push("download");
    if (status.transcript)
        completed.push("transcript");
    if (status.translate)
        completed.push("translate");
    if (status.audio)
        completed.push("audio");
    if (status.final)
        completed.push("final");
    return completed;
};
exports.completedPhasesFromStatus = completedPhasesFromStatus;
const syncProjectArtifactMetadata = (projectPath, projectName, videoUrl, videoInfo) => {
    const status = (0, exports.inspectProjectPhases)(projectPath);
    const completedPhases = (0, exports.completedPhasesFromStatus)(status);
    const urlPath = path_1.default.join(projectPath, "url.txt");
    const originalVideoDir = path_1.default.join(projectPath, "original", "video");
    const originalVideo = fs_1.default.existsSync(originalVideoDir)
        ? fs_1.default.readdirSync(originalVideoDir).find((file) => /\.(mp4|mkv|webm|avi|mov)$/i.test(file))
        : undefined;
    const sourceUrl = videoUrl || (fs_1.default.existsSync(urlPath) ? fs_1.default.readFileSync(urlPath, "utf-8").trim() : "");
    const videoId = originalVideo ? path_1.default.basename(originalVideo, path_1.default.extname(originalVideo)) : undefined;
    const metadata = {
        completedPhases,
        artifactStatus: status,
    };
    if (status.download) {
        metadata.status = "completed";
        metadata.videoInfo = videoInfo || {
            id: videoId || "video",
            title: projectName,
            author: "",
            url: sourceUrl,
            thumbnail: "",
            duration: 0,
            description: "",
        };
    }
    (0, ConfigService_1.saveProjectMetadata)(projectPath, metadata);
    return status;
};
exports.syncProjectArtifactMetadata = syncProjectArtifactMetadata;
//# sourceMappingURL=ProjectArtifacts.js.map