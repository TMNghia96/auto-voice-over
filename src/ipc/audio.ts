import { ipcMain } from "electron";
import { transcribeAudio, getExistingSrt } from "../services/TranscriptService";
import { optimizeSrtFile, parseSrt as parseSrtMain } from "../lib/SrtOptimizer";

import { generateAllAudio, generateAudioSegment, generateVoicePreview, cleanupOldPreviews, VOICE_MAP } from "../services/PiperService";
import fs from "fs";
import path from "path";

export const setupAudioIpc = () => {
    ipcMain.handle("get-existing-srt", (_event, projectPath) => {
        return getExistingSrt(projectPath);
    });

    ipcMain.on("transcribe-audio", (event, projectPath, engine, language) => {
        console.log(`[IPC] Received transcribe-audio: engine=${engine}, language=${language}, path=${projectPath}`);
        transcribeAudio(
            projectPath,
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
            const optimized = optimizeSrtFile(srtPath);
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
                const translateDir = path.join(projectPath, "translate");
                if (!fs.existsSync(translateDir)) {
                    fs.mkdirSync(translateDir, { recursive: true });
                }
                const filePath = path.join(translateDir, `${lang}.srt`);
                fs.writeFileSync(filePath, content, "utf-8");
                return filePath;
            } catch (error) {
                console.error("Failed to save translated SRT:", error);
                return null;
            }
        },
    );

    ipcMain.handle(
        "get-translated-srt",
        (_event, projectPath: string, lang: string) => {
            try {
                const srtPath = path.join(projectPath, "translate", `${lang}.srt`);
                if (fs.existsSync(srtPath)) {
                    const content = fs.readFileSync(srtPath, "utf-8");
                    return content;
                }
            } catch (error) {
                console.error("Failed to get translated SRT:", error);
            }
            return null;
        },
    );

    ipcMain.handle("read-audio-file", (_event, projectPath: string) => {
        const audioPath = path.join(projectPath, "transcript", "audio_16k.wav");
        if (fs.existsSync(audioPath)) {
            const buffer = fs.readFileSync(audioPath);
            return { buffer: buffer.buffer, mimeType: "audio/wav" };
        }
        const originalDir = path.join(projectPath, "original", "audio");
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
            try {
                const srtPath = path.join(projectPath, "translate", `${lang}.srt`);
                if (!fs.existsSync(srtPath)) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: "Không tìm thấy file SRT đã dịch!",
                    });
                    return;
                }

                const srtContent = fs.readFileSync(srtPath, "utf-8");
                const entries = parseSrtMain(srtContent);

                if (entries.length === 0) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: "File SRT trống!",
                    });
                    return;
                }

                if (!VOICE_MAP[lang]) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: `Không hỗ trợ ngôn ngữ: ${lang}`,
                    });
                    return;
                }

                const outputDir = path.join(projectPath, "audio_gene");
                if (fs.existsSync(outputDir)) {
                    const oldFiles = fs
                        .readdirSync(outputDir)
                        .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"));
                    for (const f of oldFiles) {
                        try {
                            fs.unlinkSync(path.join(outputDir, f));
                        } catch (cleanupError) {
                            console.warn(`Không thể xóa file cũ ${f}:`, cleanupError);
                        }
                    }
                }

                const results = await generateAllAudio(
                    entries,
                    lang,
                    outputDir,
                    (p) => {
                        event.sender.send("audio-generate-progress", p);
                    },
                    5, // concurrency
                    voiceId
                );

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
            }
        },
    );

    ipcMain.handle(
        "generate-single-audio",
        async (event, projectPath: string, lang: string, targetIndex: number, voiceId?: string) => {
            try {
                const srtPath = path.join(projectPath, "translate", `${lang}.srt`);
                if (!fs.existsSync(srtPath)) {
                    event.sender.send("audio-generate-progress", {
                        status: "error",
                        progress: 0,
                        detail: "Không tìm thấy file SRT đã dịch!",
                        entryIndex: targetIndex,
                        entryStatus: "failed"
                    });
                    return false;
                }

                const srtContent = fs.readFileSync(srtPath, "utf-8");
                const entries = parseSrtMain(srtContent);
                const entry = entries.find(e => e.index === targetIndex);

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

                if (!VOICE_MAP[lang]) {
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

                const outputDir = path.join(projectPath, "audio_gene");
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                const fileName = `${String(targetIndex).padStart(4, '0')}.mp3`;
                const outputPath = path.join(outputDir, fileName);

                const voiceName = voiceId || VOICE_MAP[lang].voice;
                const success = await generateAudioSegment(entry.text, voiceName, outputPath, entry);

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
                        progress: 100, // Done but failed
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
        try {
            const audioDir = path.join(projectPath, "audio_gene");
            if (!fs.existsSync(audioDir)) return [];
            const files = fs
                .readdirSync(audioDir)
                .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"))
                .sort();
            return files.map((f) => ({
                name: f,
                path: path.join(audioDir, f),
            }));
        } catch {
            return [];
        }
    });

    ipcMain.handle("read-generated-audio", (_event, filePath: string) => {
        try {
            if (!fs.existsSync(filePath)) return null;
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mime =
                ext === ".mp3" ? "audio/mpeg"
                    : ext === ".wav" ? "audio/wav"
                        : "audio/mpeg";
            const base64 = buffer.toString("base64");
            return `data:${mime};base64,${base64}`;
        } catch {
            return null;
        }
    });

    ipcMain.handle(
        "generate-voice-preview",
        async (_event, projectPath: string, lang: string, voiceId: string) => {
            try {
                const srtPath = path.join(projectPath, "translate", `${lang}.srt`);
                if (!fs.existsSync(srtPath)) {
                    return { error: "Không tìm thấy file SRT đã dịch!" };
                }
                const srtContent = fs.readFileSync(srtPath, "utf-8");
                const entries = parseSrtMain(srtContent);
                if (entries.length < 5) {
                    return { error: "Cần ít nhất 5 đoạn phụ đề để tạo preview" };
                }
                const result = await generateVoicePreview(entries, voiceId, projectPath, 3);
                return { success: true, result };
            } catch (err) {
                console.error("Preview generation failed:", err);
                return { error: `Lỗi: ${err}` };
            }
        }
    );

    ipcMain.handle("cleanup-old-previews", (_event, projectPath: string) => {
        try {
            cleanupOldPreviews();
            return { success: true };
        } catch (err) {
            console.error("Preview cleanup failed:", err);
            return { error: `Lỗi: ${err}` };
        }
    });
};
