import { ipcMain } from "electron";
import { transcribeAudio, getExistingSrt } from "../services/TranscriptService";
import { optimizeSrtFile, parseSrt as parseSrtMain } from "../lib/SrtOptimizer";

import { generateAllAudio, generateAudioSegment, generateVoicePreview, cleanupOldPreviews } from "../services/PiperService";
import { resolveVoiceName, isLanguageSupported } from "../services/tts/VoiceCatalog";
import { fetchEdgeVoices } from "../services/tts/EdgeVoiceCatalogService";
import { buildVoiceCatalogWithDynamicVoices, getPresetsForLanguage } from "../services/tts/VoiceCatalog";
import { TtsOutputManager } from "../services/tts/TtsOutputManager";
import { SrtRepository } from "../services/tts/SrtRepository";
import { getVoicePreference, setVoicePreference, loadProjectConfig, saveProjectConfig } from "../services/ProjectConfig";
import fs from "fs";
import path from "path";
import { assertAudioFile, assertProjectRoot, assertSrtFile } from "../services/PathSecurity";

let abortController: AbortController | null = null;

export const setupAudioIpc = () => {
    ipcMain.handle("get-existing-srt", (_event, projectPath) => {
        return getExistingSrt(assertProjectRoot(projectPath));
    });

    ipcMain.on("transcribe-audio", (event, projectPath, engine, language) => {
        console.log(`[IPC] Received transcribe-audio: engine=${engine}, language=${language}, path=${projectPath}`);
        let safeProjectPath: string;
        try {
            safeProjectPath = assertProjectRoot(projectPath);
        } catch {
            event.sender.send("transcript-complete", null);
            return;
        }
        transcribeAudio(
            safeProjectPath,
            (progress) => {
                event.sender.send("transcript-progress", progress);
            },
            engine || "whisper-cpu",
            language || "auto",
        ).then((result) => {
            event.sender.send("transcript-complete", result);
        });
    });

    ipcMain.handle("optimize-srt", (_event, srtPath: string) => {
        try {
            const optimized = optimizeSrtFile(assertSrtFile(srtPath));
            return { srtContent: optimized };
        } catch (error) {
            console.error("SRT optimization failed:", error);
            return null;
        }
    });

    ipcMain.handle(
        "save-translated-srt",
        (_event, projectPath: string, lang: string, content: string) => {
            try {
                const repo = new SrtRepository(assertProjectRoot(projectPath));
                return repo.save(lang, content);
            } catch (error) {
                console.error("Failed to save translated SRT:", error);
                return null;
            }
        },
    );

    ipcMain.handle(
        "get-translated-srt",
        (_event, projectPath: string, lang: string) => {
            const repo = new SrtRepository(assertProjectRoot(projectPath));
            return repo.load(lang);
        },
    );

    ipcMain.handle("read-audio-file", (_event, projectPath: string) => {
        const safeProjectPath = assertProjectRoot(projectPath);
        const audioPath = path.join(safeProjectPath, "transcript", "audio_16k.wav");
        if (fs.existsSync(audioPath)) {
            const buffer = fs.readFileSync(audioPath);
            return { buffer: buffer.buffer, mimeType: "audio/wav" };
        }
        const originalDir = path.join(safeProjectPath, "original", "audio");
        if (fs.existsSync(originalDir)) {
            const files = fs.readdirSync(originalDir);
            const audioFile = files.find((f) =>
                /\.(mp3|m4a|wav|ogg|webm|opus)$/i.test(f),
            );
            if (audioFile) {
                const ext = path.extname(audioFile).slice(1).toLowerCase();
                const mimeMap: Record<string, string> = {
                    mp3: "audio/mpeg",
                    m4a: "audio/mp4",
                    wav: "audio/wav",
                    ogg: "audio/ogg",
                    webm: "audio/webm",
                    opus: "audio/opus",
                };
                const buffer = fs.readFileSync(path.join(originalDir, audioFile));
                return {
                    buffer: buffer.buffer,
                    mimeType: mimeMap[ext] || "audio/mpeg",
                };
            }
        }
        return null;
    });

    ipcMain.on(
        "generate-audio",
        async (event, projectPath: string, lang: string, voiceId?: string) => {
            abortController = new AbortController();
            try {
                const safeProjectPath = assertProjectRoot(projectPath);
                const repo = new SrtRepository(safeProjectPath);
                const srtContent = repo.load(lang);
                if (!srtContent) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: "Không tìm thấy file SRT đã dịch!",
                    });
                    return;
                }

                const entries = parseSrtMain(srtContent);

                if (entries.length === 0) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: "File SRT trống!",
                    });
                    return;
                }

                if (!isLanguageSupported(lang)) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: `Không hỗ trợ ngôn ngữ: ${lang}`,
                    });
                    return;
                }

                const outManager = new TtsOutputManager(safeProjectPath);
                outManager.clearSegments();
                outManager.ensureExists();

                const voiceName = resolveVoiceName(lang, voiceId)!;
                const config = loadProjectConfig(safeProjectPath);
                const concurrency = config.concurrencySettings?.initial ?? 10;
                const results = await generateAllAudio(
                    entries.map((e: { index: number; text: string }) => ({ index: e.index, text: e.text })),
                    lang,
                    outManager.dir,
                    (p) => {
                        event.sender.send("audio-generate-progress", p);
                    },
                    concurrency,
                    voiceId || undefined,
                    abortController.signal
                );

                if (abortController.signal.aborted) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: "Đã hủy tạo audio.",
                    });
                    return;
                }

                const successCount = results.filter((r) => r !== "").length;
                event.sender.send("audio-generate-progress", {
                    status: "done",
                    progress: 100,
                    detail: `Hoàn tất! ${successCount}/${entries.length} audio đã được tạo.`,
                    current: successCount,
                    total: entries.length,
                });
            } catch (err) {
                console.error("Audio generation failed:", err);
                event.sender.send("audio-generate-progress", {
                    status: "error",
                    progress: 0,
                    detail: `Lỗi: ${err}`,
                });
            } finally {
                abortController = null;
            }
        },
    );

    ipcMain.on("cancel-audio-generation", () => {
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    });

    ipcMain.handle(
        "generate-single-audio",
        async (event, projectPath: string, lang: string, targetIndex: number, voiceId?: string) => {
            try {
                const safeProjectPath = assertProjectRoot(projectPath);
                const repo = new SrtRepository(safeProjectPath);
                const srtContent = repo.load(lang);
                if (!srtContent) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: "Không tìm thấy file SRT đã dịch!",
                        entryIndex: targetIndex,
                        entryStatus: "failed"
                    });
                    return false;
                }

                const entries = parseSrtMain(srtContent);
                const entry = entries.find((e: { index: number }) => e.index === targetIndex);

                if (!entry) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: `Không tìm thấy đoạn phụ đề số ${targetIndex}`,
                        entryIndex: targetIndex,
                        entryStatus: "failed"
                    });
                    return false;
                }

                if (!isLanguageSupported(lang)) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: `Không hỗ trợ ngôn ngữ: ${lang}`,
                        entryIndex: targetIndex,
                        entryStatus: "failed"
                    });
                    return false;
                }

                event.sender.send("audio-generate-progress", {
                    status: "generating",
                    progress: 100,
                    detail: `Đang tạo lại đoạn ${targetIndex}...`,
                    entryIndex: targetIndex,
                    entryStatus: "start"
                });

                const outManager = new TtsOutputManager(safeProjectPath);
                outManager.ensureExists();

                const outputPath = outManager.segmentPath(targetIndex);
                const voiceName = resolveVoiceName(lang, voiceId)!;
                const success = await generateAudioSegment(entry.text, voiceName, outputPath);

                if (success) {
                    event.sender.send("audio-generate-progress", {
                        status: "done",
                        progress: 100,
                        detail: `Đã tạo lại đoạn ${targetIndex}`,
                        entryIndex: targetIndex,
                        entryStatus: "done"
                    });
                    return true;
                } else {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 100,
                        detail: `Tạo đoạn ${targetIndex} thất bại`,
                        entryIndex: targetIndex,
                        entryStatus: "failed"
                    });
                    return false;
                }
            } catch (err) {
                console.error("Single audio generation failed:", err);
                event.sender.send("audio-generate-progress", {
                    status: "error",
                    progress: 100,
                    detail: `Lỗi khi tạo lại đoạn ${targetIndex}: ${err}`,
                    entryIndex: targetIndex,
                    entryStatus: "failed"
                });
                return false;
            }
        }
    );

    ipcMain.handle("list-generated-audio", (_event, projectPath: string) => {
        const outManager = new TtsOutputManager(assertProjectRoot(projectPath));
        return outManager.listSegments();
    });

    ipcMain.handle("read-generated-audio", (_event, filePath: string) => {
        const safeFilePath = assertAudioFile(filePath);
        const buffer = fs.readFileSync(safeFilePath);
        const ext = path.extname(safeFilePath).toLowerCase();
        const mime = ext === ".wav" ? "audio/wav" : "audio/mpeg";
        return `data:${mime};base64,${buffer.toString("base64")}`;
    });

    ipcMain.handle(
        "generate-voice-preview",
        async (_event, projectPath: string, lang: string, voiceId: string) => {
            try {
                const safeProjectPath = assertProjectRoot(projectPath);
                const repo = new SrtRepository(safeProjectPath);
                const srtContent = repo.load(lang);
                if (!srtContent) {
                    return { error: "Không tìm thấy file SRT đã dịch!" };
                }
                const entries = parseSrtMain(srtContent);
                if (entries.length < 5) {
                    return { error: "Cần ít nhất 5 đoạn phụ đề để tạo preview" };
                }
                const result = await generateVoicePreview(entries, voiceId, safeProjectPath, 3);
                return { success: true, result };
            } catch (err) {
                console.error("Preview generation failed:", err);
                return { error: `Lỗi: ${err}` };
            }
        }
    );

    ipcMain.handle(
        "retry-failed-audio",
        async (event, projectPath: string, lang: string, failedIndices: number[], voiceId?: string) => {
            try {
                const safeProjectPath = assertProjectRoot(projectPath);
                const repo = new SrtRepository(safeProjectPath);
                const srtContent = repo.load(lang);
                if (!srtContent) {
                    return { success: false, error: "Không tìm thấy file SRT đã dịch!" };
                }
                const entries = parseSrtMain(srtContent);
                const failedEntries = entries.filter((e: { index: number }) => failedIndices.includes(e.index));
                if (failedEntries.length === 0) {
                    return { success: false, error: "Không có đoạn nào cần tạo lại" };
                }
                const outManager = new TtsOutputManager(safeProjectPath);
                outManager.ensureExists();
                const config = loadProjectConfig(safeProjectPath);
                const concurrency = config.concurrencySettings?.initial ?? 10;
                const results = await generateAllAudio(
                    failedEntries.map((e: { index: number; text: string }) => ({ index: e.index, text: e.text })),
                    lang,
                    outManager.dir,
                    (p) => { event.sender.send("audio-generate-progress", p); },
                    concurrency,
                    voiceId
                );
                const successCount = results.filter((r) => r !== "").length;
                return { success: true, successCount, totalCount: failedEntries.length };
            } catch (err) {
                console.error("Batch retry failed:", err);
                return { success: false, error: `Lỗi: ${err}` };
            }
        }
    );

    ipcMain.handle("get-voice-preference", (_event, projectPath: string, lang: string) => {
        return getVoicePreference(assertProjectRoot(projectPath), lang);
    });
    ipcMain.handle("set-voice-preference", (_event, projectPath: string, lang: string, voiceId: string) => {
        setVoicePreference(assertProjectRoot(projectPath), lang, voiceId);
        return { success: true };
    });

    ipcMain.handle("cleanup-old-previews", (_event, projectPath: string) => {
        try {
            cleanupOldPreviews(assertProjectRoot(projectPath));
            return { success: true };
        } catch (err) {
            console.error("Preview cleanup failed:", err);
            return { error: `Lỗi: ${err}` };
        }
    });

    ipcMain.handle("get-concurrency-settings", (_event, projectPath: string) => {
        const config = loadProjectConfig(assertProjectRoot(projectPath));
        return config.concurrencySettings ?? { initial: 10, min: 1, max: 20 };
    });

    ipcMain.handle("set-concurrency-settings", (_event, projectPath: string, settings: { initial: number; min: number; max: number }) => {
        const safeProjectPath = assertProjectRoot(projectPath);
        const config = loadProjectConfig(safeProjectPath);
        config.concurrencySettings = settings;
        saveProjectConfig(safeProjectPath, config);
        return { success: true };
    });

    ipcMain.handle("get-voices-for-language", async (_event, lang: string) => {
        try {
            const dynamicVoices = await fetchEdgeVoices();
            const catalog = buildVoiceCatalogWithDynamicVoices(dynamicVoices);
            return { success: true, voices: catalog.allVoices[lang] || getPresetsForLanguage(lang) };
        } catch (error) {
            console.error("Failed to fetch dynamic voices:", error);
            return { success: true, voices: getPresetsForLanguage(lang) };
        }
    });
};
