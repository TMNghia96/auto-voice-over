import fs from "fs";
import path from "path";
import { saveProjectMetadata } from "./ConfigService";

export interface ProjectPhaseStatus {
  download: boolean;
  transcript: boolean;
  translate: boolean;
  audio: boolean;
  final: boolean;
}

const hasFile = (dir: string, pattern: RegExp): boolean => {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((file) => pattern.test(file));
};

export const inspectProjectPhases = (projectPath: string): ProjectPhaseStatus => {
  const videoDir = path.join(projectPath, "original", "video");
  const audioDir = path.join(projectPath, "original", "audio");
  const transcriptDir = path.join(projectPath, "transcript");
  const translateDir = path.join(projectPath, "translate");
  const generatedAudioDir = path.join(projectPath, "audio_gene");
  const finalVideoPath = path.join(projectPath, "final", "final_video.mp4");

  return {
    download: hasFile(videoDir, /\.(mp4|mkv|webm|avi|mov)$/i) && hasFile(audioDir, /\.(mp3|m4a|wav|opus|ogg|webm)$/i),
    transcript: hasFile(transcriptDir, /\.srt$/i),
    translate: hasFile(translateDir, /\.srt$/i),
    audio: hasFile(generatedAudioDir, /\.(mp3|wav)$/i),
    final: fs.existsSync(finalVideoPath),
  };
};

export const completedPhasesFromStatus = (status: ProjectPhaseStatus): string[] => {
  const completed: string[] = [];
  if (status.download) completed.push("download");
  if (status.transcript) completed.push("transcript");
  if (status.translate) completed.push("translate");
  if (status.audio) completed.push("audio");
  if (status.final) completed.push("final");
  return completed;
};

export const syncProjectArtifactMetadata = (
  projectPath: string,
  projectName: string,
  videoUrl?: string,
  videoInfo?: Record<string, unknown>,
): ProjectPhaseStatus => {
  const status = inspectProjectPhases(projectPath);
  const completedPhases = completedPhasesFromStatus(status);
  const urlPath = path.join(projectPath, "url.txt");
  const originalVideoDir = path.join(projectPath, "original", "video");
  const originalVideo = fs.existsSync(originalVideoDir)
    ? fs.readdirSync(originalVideoDir).find((file) => /\.(mp4|mkv|webm|avi|mov)$/i.test(file))
    : undefined;
  const sourceUrl = videoUrl || (fs.existsSync(urlPath) ? fs.readFileSync(urlPath, "utf-8").trim() : "");
  const videoId = originalVideo ? path.basename(originalVideo, path.extname(originalVideo)) : undefined;

  const metadata: Record<string, unknown> = {
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

  saveProjectMetadata(projectPath, metadata);
  return status;
};
