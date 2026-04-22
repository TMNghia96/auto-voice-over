import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { getFfmpegPath } from './EnvironmentService';
import { tempManager } from './TempFileManager';
import { AudioSegmentBuilder } from './audio/AudioSegmentBuilder';
import { AudioProcessor, cancelAudioProcessing } from './audio/AudioProcessor';
import { EncoderFactory } from './video/encoders/EncoderFactory';
import { SegmentValidator } from './video/SegmentValidator';
import { VideoProcessor } from './video/VideoProcessor';

let activeProcesses: ReturnType<typeof spawn>[] = [];
export let isCancelled = false;

export const cancelFinalVideo = () => {
    isCancelled = true;
    cancelAudioProcessing();
    for (const proc of activeProcesses) {
        try {
            if (process.platform === 'win32' && proc.pid) {
                exec(`taskkill /pid ${proc.pid} /t /f`);
            } else {
                proc.kill('SIGKILL');
            }
        } catch (e) {}
    }
    activeProcesses = [];
};

export interface FinalVideoProgress {
    status: 'preparing' | 'processing' | 'concatenating' | 'rerendering' | 'done' | 'error';
    progress: number;
    detail: string;
    current?: number;
    total?: number;
}

export interface FinalVideoConfig {
    duckVolume?: number;
    fadeDuration?: number;
    encoderPreference?: 'gpu' | 'cpu' | 'auto';
}

const getMediaDuration = async (filePath: string): Promise<number> => {
    return new Promise((resolve) => {
        const ffmpeg = getFfmpegPath();
        const proc = spawn(ffmpeg, ['-i', filePath, '-f', 'null', '-'], { windowsHide: true });

        let stderr = '';
        proc.stderr.on('data', (data) => stderr += data.toString());

        proc.on('close', () => {
            const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
            if (match) {
                const hours = parseInt(match[1]);
                const minutes = parseInt(match[2]);
                const seconds = parseInt(match[3]);
                const decimals = parseFloat(`0.${match[4]}`);
                resolve(hours * 3600 + minutes * 60 + seconds + decimals);
            } else {
                resolve(0);
            }
        });
        proc.on('error', () => resolve(0));
    });
};

const runFfmpeg = (args: string[]): Promise<{ success: boolean; stderr: string }> => {
    return new Promise((resolve) => {
        if (isCancelled) return resolve({ success: false, stderr: 'Cancelled' });
        const ffmpeg = getFfmpegPath();
        const proc = spawn(ffmpeg, args, { windowsHide: true });
        activeProcesses.push(proc);
        let stderr = '';

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            activeProcesses = activeProcesses.filter(p => p !== proc);
            resolve({ success: code === 0, stderr });
        });

        proc.on('error', (err) => {
            activeProcesses = activeProcesses.filter(p => p !== proc);
            resolve({ success: false, stderr: err.message });
        });
    });
};

const hasAudioStream = async (filePath: string): Promise<boolean> => {
    const { stderr } = await runFfmpeg(['-i', filePath, '-hide_banner']);
    return /Stream\s+#.*Audio:/i.test(stderr);
};

const findOriginalAudio = (projectPath: string): string | null => {
    const audioDir = path.join(projectPath, 'original', 'audio');
    if (!fs.existsSync(audioDir)) return null;
    const files = fs.readdirSync(audioDir);
    const audioFile = files.find(f => /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f));
    return audioFile ? path.join(audioDir, audioFile) : null;
};

const findOriginalVideo = (projectPath: string): string | null => {
    const videoDir = path.join(projectPath, 'original', 'video');
    if (!fs.existsSync(videoDir)) return null;
    const files = fs.readdirSync(videoDir);
    const videoFile = files.find(f => /\.(mp4|mkv|webm|avi|mov)$/i.test(f));
    return videoFile ? path.join(videoDir, videoFile) : null;
};

export const createFinalVideo = async (
    projectPath: string,
    onProgress: (p: FinalVideoProgress) => void,
    duckVolume: number = 0.15,
    fadeDuration: number = 0.5,
    config?: FinalVideoConfig
): Promise<string | null> => {
    try {
        isCancelled = false;
        activeProcesses = [];
        const startTime = Date.now();

        // Merge config with defaults
        const finalConfig: FinalVideoConfig = {
            duckVolume,
            fadeDuration,
            encoderPreference: 'auto',
            ...config
        };

        // 1. Setup - Find original files
        onProgress({ status: 'preparing', progress: 5, detail: 'Đang tìm file gốc...' });
        
        const originalVideo = findOriginalVideo(projectPath);
        if (!originalVideo) {
            onProgress({ status: 'error', progress: 0, detail: 'Không tìm thấy video gốc!' });
            return null;
        }

        const videoDuration = await getMediaDuration(originalVideo);
        if (videoDuration === 0) {
            onProgress({ status: 'error', progress: 0, detail: 'Không thể đọc thông tin video gốc!' });
            return null;
        }

        const tempDir = path.join(projectPath, 'temp_final');
        
        // Clean up existing temp directory
        if (fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (err) {
                console.warn('[FinalVideoService] Failed to remove existing temp dir:', err);
            }
        }
        
        // Wait a bit for Windows to release file locks
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Create fresh temp directory
        fs.mkdirSync(tempDir, { recursive: true });
        tempManager.register(tempDir);

        // 2. Build segment map
        onProgress({ status: 'preparing', progress: 10, detail: 'Đang phân tích phân đoạn...' });
        
        const segmentBuilder = new AudioSegmentBuilder();
        const segments = await segmentBuilder.buildSegmentMap(projectPath, videoDuration);

        if (segments.length === 0) {
            onProgress({ status: 'error', progress: 0, detail: 'Không có phân đoạn nào để xử lý!' });
            return null;
        }

        // 3. Prepare full audio
        onProgress({ status: 'preparing', progress: 15, detail: 'Đang chuẩn bị luồng âm thanh gốc...' });
        
        const externalAudio = findOriginalAudio(projectPath);
        const vidHasAudio = await hasAudioStream(originalVideo);
        
        const fullAudioWav = path.join(tempDir, 'full_audio.wav');
        let audioPrepResult;

        if (externalAudio) {
            audioPrepResult = await runFfmpeg(['-y', '-i', externalAudio, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', videoDuration.toFixed(3), fullAudioWav]);
        } else if (vidHasAudio) {
            audioPrepResult = await runFfmpeg(['-y', '-i', originalVideo, '-vn', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', videoDuration.toFixed(3), fullAudioWav]);
        } else {
            audioPrepResult = await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', videoDuration.toFixed(3), '-c:a', 'pcm_s16le', fullAudioWav]);
        }

        if (!audioPrepResult.success || !fs.existsSync(fullAudioWav)) {
            onProgress({ status: 'error', progress: 15, detail: 'Lỗi khởi tạo âm thanh gốc.' });
            return null;
        }

        // 4. Process audio segments
        onProgress({ status: 'processing', progress: 20, detail: 'Đang xử lý âm thanh...' });
        
        const ffmpegPath = getFfmpegPath();
        const audioProcessor = new AudioProcessor(ffmpegPath, finalConfig.duckVolume!, finalConfig.fadeDuration!);
        
        const audioResult = await audioProcessor.processAudioSegments(
            segments,
            fullAudioWav,
            tempDir,
            (pct) => {
                const progress = 20 + Math.round(pct * 0.3);
                onProgress({
                    status: 'processing',
                    progress,
                    detail: `Đang xử lý âm thanh ${Math.round(pct)}%...`
                });
            }
        );

        // 5. Concatenate audio
        onProgress({ status: 'concatenating', progress: 55, detail: 'Đang kết dính luồng âm thanh...' });
        
        const finalAudioWav = await audioProcessor.concatenateAudio(
            audioResult.segmentPaths,
            tempDir
        );

        // Verify audio sync
        const totalExpected = segments.reduce((sum, s) => sum + s.targetDuration, 0);
        const totalActual = await getMediaDuration(finalAudioWav);
        const finalDrift = totalActual - totalExpected;
        
        if (Math.abs(finalDrift) > 0.1) {
            console.warn(`[Sync] Final audio drift: ${finalDrift.toFixed(3)}s (expected: ${totalExpected.toFixed(2)}s, actual: ${totalActual.toFixed(2)}s)`);
        }

        // 6. Validate segments based on ACTUAL audio durations
        onProgress({ status: 'rerendering', progress: 60, detail: 'Đang xác thực phân đoạn...' });
        
        const validator = new SegmentValidator();
        const validatedSegments = validator.validateAndAdjust(
            segments,
            audioResult.actualDurations,
            videoDuration
        );

        // 7. Process video segments
        onProgress({ status: 'rerendering', progress: 65, detail: 'Đang xử lý video...' });
        
        const encoderFactory = new EncoderFactory(finalConfig.encoderPreference || 'auto');
        const videoProcessor = new VideoProcessor(encoderFactory, validator, {
            concurrency: 6,
            maxRetries: 3,
            retryDelay: 1000,
            encoderPreference: finalConfig.encoderPreference || 'auto'
        });

        const videoSegmentPaths = await videoProcessor.processVideoSegments(
            validatedSegments,
            originalVideo,
            tempDir,
            (pct) => {
                const progress = 65 + Math.round(pct * 20);
                onProgress({
                    status: 'rerendering',
                    progress,
                    detail: `Đang xử lý video ${Math.round(pct * 100)}%...`
                });
            }
        );

        // 8. Concatenate video
        onProgress({ status: 'rerendering', progress: 85, detail: 'Đang gộp các đoạn video...' });
        
        const mergedVideo = path.join(tempDir, 'merged_video.mp4');
        await videoProcessor.concatenateVideo(videoSegmentPaths, mergedVideo);

        // 9. Mux final video with audio
        onProgress({ status: 'rerendering', progress: 90, detail: 'Đang thêm âm thanh vào video...' });
        
        const outputDir = path.join(projectPath, 'final');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const outputPath = path.join(outputDir, 'final_video.mp4');
        await videoProcessor.muxWithAudio(mergedVideo, finalAudioWav, outputPath);

        // Cleanup
        tempManager.unregister(tempDir);
        await tempManager.cleanup();

        const totalTime = Math.round((Date.now() - startTime) / 1000);
        onProgress({ status: 'done', progress: 100, detail: `Hoàn tất! Render mất ${totalTime}s.` });

        return outputPath;

    } catch (err: any) {
        const tempDir = path.join(projectPath, 'temp_final');
        tempManager.unregister(tempDir);
        await tempManager.cleanup();
        
        if (err.message === "Cancelled by user") {
            onProgress({ status: 'error', progress: 0, detail: `Đã huỷ xuất video!` });
            return null;
        }
        console.error('Create final video failed:', err);
        onProgress({ status: 'error', progress: 0, detail: `Lỗi System: ${err.message}` });
        return null;
    }
};
