import { ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { hasApiKey, setApiKey, getPrompts, savePrompts, getActivePromptId, setActivePromptId, getDefaultBackgroundVolume, setDefaultBackgroundVolume, getDefaultFadeDuration, setDefaultFadeDuration } from "../services/ConfigService";
import { assertProjectRoot, assertVideoFile, findAllowedProjectRootForPath } from "../services/PathSecurity";
import { translateSegments } from "../services/TranslationService";
import { inspectProjectPhases } from "../services/ProjectArtifacts";

export const setupSystemIpc = () => {
    ipcMain.handle("get-api-key", (_event, provider: string) => {
        console.warn(`[IPC] get-api-key is deprecated and no longer returns secrets for provider: ${provider}`);
        return "";
    });

    ipcMain.handle("has-api-key", (_event, provider: string) => {
        return hasApiKey(provider);
    });

    ipcMain.handle("set-api-key", (_event, provider: string, key: string) => {
        return setApiKey(provider, key);
    });

    ipcMain.handle("translate-segments", async (_event, targetLang: string, texts: string[], promptId?: string) => {
        return translateSegments({ targetLang, texts, promptId });
    });

    ipcMain.handle("open-in-explorer", (_event, filePath: string) => {
        try {
            if (!findAllowedProjectRootForPath(filePath)) return false;
            shell.showItemInFolder(filePath);
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle("open-file", async (_event, filePath: string) => {
        try {
            if (!findAllowedProjectRootForPath(filePath)) return false;
            await shell.openPath(filePath);
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle("read-video-file", (_event, filePath: string) => {
        try {
            const safeFilePath = assertVideoFile(filePath);
            const buffer = fs.readFileSync(safeFilePath);
            const ext = path.extname(safeFilePath).toLowerCase();
            const mime =
                ext === ".mp4" ? "video/mp4"
                    : ext === ".mkv" ? "video/x-matroska"
                        : ext === ".webm" ? "video/webm"
                            : "video/mp4";
            const base64 = buffer.toString("base64");
            return `data:${mime};base64,${base64}`;
        } catch {
            return null;
        }
    });

    ipcMain.handle("check-project-phases", (_event, projectPath: string) => {
        const empty = { download: false, transcript: false, translate: false, audio: false, final: false };
        try {
            const safeProjectPath = assertProjectRoot(projectPath);
            if (!safeProjectPath || !fs.existsSync(safeProjectPath)) return empty;

            const artifactStatus = inspectProjectPhases(safeProjectPath);
            const configFile = path.join(safeProjectPath, "project.json");
            if (!fs.existsSync(configFile)) return artifactStatus;

            const meta = JSON.parse(fs.readFileSync(configFile, "utf-8"));
            const completed: string[] = meta.completedPhases || [];

            return {
                download: artifactStatus.download || completed.includes("download"),
                transcript: artifactStatus.transcript || completed.includes("transcript"),
                translate: artifactStatus.translate || completed.includes("translate"),
                audio: artifactStatus.audio || completed.includes("audio"),
                final: artifactStatus.final || completed.includes("final"),
            };
        } catch {
            return empty;
        }
    });

    ipcMain.handle("get-prompts", () => {
        return getPrompts();
    });

    ipcMain.handle("save-prompts", (_event, prompts: any[]) => {
        return savePrompts(prompts);
    });

    ipcMain.handle("get-active-prompt-id", () => {
        return getActivePromptId();
    });

    ipcMain.handle("set-active-prompt-id", (_event, id: string) => {
        return setActivePromptId(id);
    });

    ipcMain.handle("get-default-background-volume", () => {
        return getDefaultBackgroundVolume();
    });

    ipcMain.handle("set-default-background-volume", (_event, volume: number) => {
        return setDefaultBackgroundVolume(volume);
    });

    ipcMain.handle("get-default-fade-duration", () => {
        return getDefaultFadeDuration();
    });

    ipcMain.handle("set-default-fade-duration", (_event, duration: number) => {
        return setDefaultFadeDuration(duration);
    });
};
