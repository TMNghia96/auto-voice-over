import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { getFfmpegPath, getFfprobePath } from './EnvironmentService';
import { parseSrt, timeToSeconds } from '../lib/SrtOptimizer';
import { getHardwareInfo } from './HardwareService';
import pLimit from 'p-limit';
import { tempManager } from './TempFileManager';

let activeProcesses: ReturnType<typeof spawn>[] = [];
export let isCancelled = false;

export const cancelFinalVideo = () => {
    isCancelled = true;
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

interface Segment {
    type: 'dubbed' | 'gap';
    index?: number;
    videoStart: number;
    videoEnd: number;
    videoDuration: number;
    audioPath?: string;
    audioDuration?: number;
    targetDuration: number;
    audioSpeed: number;
    videoSpeed: number;
    fadeStart?: boolean;
    fadeEnd?: boolean;
}

interface SegmentTiming {
    expectedDuration: number;
    actualDuration: number;
    drift: number;
}

const MAX_AUDIO_SPEEDUP = 1.4; // Tăng từ 1.3 để giảm slow motion video

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

const getAtempoFilter = (speed: number): string => {
    if (Math.abs(speed - 1.0) < 0.001) return '';
    let r = speed;
    const stack = [];
    while (r > 2.0) {
        stack.push('atempo=2.0');
        r /= 2.0;
    }
    while (r < 0.5) {
        stack.push('atempo=0.5');
        r /= 0.5;
    }
    if (Math.abs(r - 1.0) > 0.001) stack.push(`atempo=${r.toFixed(4)}`);
    return stack.join(',');
};

const createFadeExpression = (
    seg: Segment,
    duckVolume: number,
    fadeDuration: number
): string => {
    const duck = duckVolume.toFixed(2);
    
    // If segment is too short for any meaningful fade, return constant volume
    if (seg.targetDuration < 0.2) {
        // For gap segments, use duck volume; for others use full volume
        return seg.fadeStart || seg.fadeEnd ? duck : '1.0';
    }
    
    const minDuration = fadeDuration * 2 + 0.1;
    let adjustedFade = fadeDuration;
    
    if (seg.targetDuration < minDuration) {
        adjustedFade = Math.max(0.05, (seg.targetDuration - 0.1) / 2);
    }
    
    const fadeOutStart = seg.targetDuration - adjustedFade;
    
    // Ensure fadeOutStart is not negative
    if (fadeOutStart <= 0 || adjustedFade <= 0) {
        // Segment too short for fade, return constant duck volume
        return duck;
    }
    
    const range = (1.0 - duckVolume).toFixed(2);
    const fade = adjustedFade.toFixed(3);
    const fadeOut = fadeOutStart.toFixed(3);
    
    // Use gte instead of lt for fade-out to avoid negative time calculations
    if (seg.fadeStart && seg.fadeEnd) {
        return `if(lt(t,${fade}),${duck}+${range}*t/${fade},if(gte(t,${fadeOut}),1.0-${range}*(t-${fadeOut})/${fade},1.0))`;
    } else if (seg.fadeStart) {
        return `if(lt(t,${fade}),${duck}+${range}*t/${fade},1.0)`;
    } else if (seg.fadeEnd) {
        return `if(gte(t,${fadeOut}),1.0-${range}*(t-${fadeOut})/${fade},1.0)`;
    }
    
    return '1.0';
};

const validateFadeExpression = (expr: string): boolean => {
    if (expr.length > 250) return false;
    let count = 0;
    for (const char of expr) {
        if (char === '(') count++;
        if (char === ')') count--;
        if (count < 0) return false;
    }
    return count === 0;
};

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

const getVideoFps = (filePath: string): Promise<number> => {
    return new Promise((resolve) => {
        const ffprobe = getFfprobePath();
        const proc = spawn(ffprobe, [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=r_frame_rate',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ], { windowsHide: true });

        let stdout = '';
        proc.stdout.on('data', (data) => stdout += data.toString());

        proc.on('close', (code) => {
            if (code === 0 && stdout.trim()) {
                const [num, den] = stdout.trim().split('/').map(Number);
                if (den && den !== 0) return resolve(num / den);
            }
            resolve(30);
        });
        proc.on('error', () => resolve(30));
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

const findOriginalSrt = (projectPath: string): string | null => {
    const srtDir = path.join(projectPath, 'transcript');
    if (!fs.existsSync(srtDir)) return null;
    const files = fs.readdirSync(srtDir);
    const srtFile = files.find(f => f.endsWith('.srt'));
    return srtFile ? path.join(srtDir, srtFile) : null;
};

const buildSegmentMap = async (
    srtContent: string,
    audioDir: string,
    totalVideoDuration: number,
): Promise<Segment[]> => {
    const entries = parseSrt(srtContent);
    const segments: Segment[] = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const entryStart = timeToSeconds(entry.startTime);
        const entryEnd = timeToSeconds(entry.endTime);

        if (entryEnd <= entryStart) continue; // Bỏ qua đoạn rỗng hoặc lỗi thời gian

        const prevEnd = i === 0 ? 0 : timeToSeconds(entries[i - 1].endTime);
        if (entryStart > prevEnd + 0.05) {
            segments.push({
                type: 'gap',
                videoStart: prevEnd,
                videoEnd: entryStart,
                videoDuration: entryStart - prevEnd,
                targetDuration: entryStart - prevEnd,
                audioSpeed: 1.0,
                videoSpeed: 1.0,
            });
        }

        const audioFileName = `${String(entry.index).padStart(4, '0')}.mp3`;
        const audioPath = path.join(audioDir, audioFileName);
        let audioDuration = 0;
        if (fs.existsSync(audioPath)) {
            audioDuration = await getMediaDuration(audioPath);
        }

        const originalDuration = entryEnd - entryStart;
        let targetDuration = originalDuration;
        let audioSpeed = 1.0;
        let videoSpeed = 1.0;

        if (audioDuration > 0) {
            const ratio = audioDuration / originalDuration;
            if (ratio > MAX_AUDIO_SPEEDUP) {
                // Audio quá dài -> Tăng tốc tối đa 1.4x và làm chậm video tương ứng
                audioSpeed = MAX_AUDIO_SPEEDUP;
                targetDuration = audioDuration / MAX_AUDIO_SPEEDUP;
                videoSpeed = targetDuration / originalDuration;
                
                console.log(`[SegmentMap] Segment ${entry.index} (LONG AUDIO):`);
                console.log(`  videoStart: ${entryStart.toFixed(3)}s, videoEnd: ${entryEnd.toFixed(3)}s`);
                console.log(`  videoDuration: ${originalDuration.toFixed(3)}s`);
                console.log(`  audioDuration: ${audioDuration.toFixed(3)}s`);
                console.log(`  ratio: ${ratio.toFixed(4)} (> ${MAX_AUDIO_SPEEDUP})`);
                console.log(`  → audioSpeed: ${audioSpeed.toFixed(4)}`);
                console.log(`  → targetDuration: ${targetDuration.toFixed(3)}s`);
                console.log(`  → videoSpeed: ${videoSpeed.toFixed(4)} (slow motion)`);
            } else if (ratio > 1.0) {
                // Audio dài hơn nhưng <= 1.4x -> Tăng tốc audio để vừa khít originalDuration
                audioSpeed = ratio;
                targetDuration = originalDuration;
                videoSpeed = 1.0;
                
                console.log(`[SegmentMap] Segment ${entry.index} (SPEEDUP AUDIO):`);
                console.log(`  videoDuration: ${originalDuration.toFixed(3)}s, audioDuration: ${audioDuration.toFixed(3)}s`);
                console.log(`  ratio: ${ratio.toFixed(4)}`);
                console.log(`  → audioSpeed: ${audioSpeed.toFixed(4)}, targetDuration: ${targetDuration.toFixed(3)}s, videoSpeed: 1.0`);
            } else {
                // Audio ngắn hơn -> Giữ nguyên 1.0x, padding silence ở cuối (targetDuration = originalDuration)
                audioSpeed = 1.0;
                targetDuration = originalDuration;
                videoSpeed = 1.0;
                
                if (ratio < 0.95) {
                    console.log(`[SegmentMap] Segment ${entry.index} (SHORT AUDIO - PADDING):`);
                    console.log(`  videoDuration: ${originalDuration.toFixed(3)}s, audioDuration: ${audioDuration.toFixed(3)}s`);
                    console.log(`  ratio: ${ratio.toFixed(4)}`);
                    console.log(`  → Will pad ${(originalDuration - audioDuration).toFixed(3)}s silence`);
                }
            }
        }

        segments.push({
            type: 'dubbed',
            index: entry.index,
            videoStart: entryStart,
            videoEnd: entryEnd,
            videoDuration: entryEnd - entryStart,
            audioPath: fs.existsSync(audioPath) ? audioPath : undefined,
            audioDuration,
            targetDuration,
            audioSpeed,
            videoSpeed,
        });
    }

    if (entries.length > 0) {
        const lastEnd = timeToSeconds(entries[entries.length - 1].endTime);
        if (totalVideoDuration > lastEnd + 0.05) {
            segments.push({
                type: 'gap',
                videoStart: lastEnd,
                videoEnd: totalVideoDuration,
                videoDuration: totalVideoDuration - lastEnd,
                targetDuration: totalVideoDuration - lastEnd,
                audioSpeed: 1.0,
                videoSpeed: 1.0,
            });
        }
    }

    // Gắn cờ fade cho các đoạn gap
    for (let i = 0; i < segments.length; i++) {
        if (segments[i].type === 'gap') {
            segments[i].fadeStart = (i > 0 && segments[i - 1].type === 'dubbed');
            segments[i].fadeEnd = (i < segments.length - 1 && segments[i + 1].type === 'dubbed');
        }
    }

    // DEBUG: Export segment map to JSON for analysis
    console.log(`[SegmentMap] Total segments: ${segments.length}`);
    const totalTargetDuration = segments.reduce((sum, s) => sum + s.targetDuration, 0);
    console.log(`[SegmentMap] Total target duration: ${totalTargetDuration.toFixed(3)}s`);
    console.log(`[SegmentMap] Original video duration: ${totalVideoDuration.toFixed(3)}s`);
    console.log(`[SegmentMap] Duration difference: ${(totalTargetDuration - totalVideoDuration).toFixed(3)}s`);
    
    // Count segments by type
    const dubbedCount = segments.filter(s => s.type === 'dubbed').length;
    const gapCount = segments.filter(s => s.type === 'gap').length;
    console.log(`[SegmentMap] Dubbed: ${dubbedCount}, Gap: ${gapCount}`);
    
    // Check for invalid segments
    const invalidSegments = segments.filter(s => s.targetDuration <= 0 || isNaN(s.targetDuration));
    if (invalidSegments.length > 0) {
        console.error(`[SegmentMap] WARNING: ${invalidSegments.length} segments have invalid targetDuration!`);
        invalidSegments.forEach(s => {
            console.error(`  Segment ${s.index || 'gap'}: targetDuration=${s.targetDuration}`);
        });
    }

    return segments;
};

export const createFinalVideo = async (
    projectPath: string,
    onProgress: (p: FinalVideoProgress) => void,
    duckVolume: number = 0.15, // Giảm âm thanh gốc còn 15% khi có âm lồng tiếng
    fadeDuration: number = 0.5   // Thời gian fade cho các đoạn gap (mặc định 0.5s)
): Promise<string | null> => {
    try {
        isCancelled = false;
        activeProcesses = [];
        
        const originalVideo = findOriginalVideo(projectPath);
        if (!originalVideo) {
            onProgress({ status: 'error', progress: 0, detail: 'Không tìm thấy video gốc!' });
            return null;
        }

        const originalSrt = findOriginalSrt(projectPath);
        if (!originalSrt) {
            onProgress({ status: 'error', progress: 0, detail: 'Không tìm thấy file SRT gốc!' });
            return null;
        }

        const audioDir = path.join(projectPath, 'audio_gene');
        if (!fs.existsSync(audioDir)) {
            onProgress({ status: 'error', progress: 0, detail: 'Không tìm thấy thư mục audio_gene!' });
            return null;
        }

        // Tự động phân giải phần cứng
        const hwInfo = await getHardwareInfo();
        let HW_VIDEO_ARGS = ['-c:v', 'libx264', '-crf', '22']; // Fallback: CPU
        
        if (hwInfo.hasAmdGpu) {
            HW_VIDEO_ARGS = ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '20', '-qp_b', '20'];
        } else if (hwInfo.hasNvidiaGpu) {
            HW_VIDEO_ARGS = ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '20', '-b:v', '0'];
        }

        onProgress({ status: 'preparing', progress: 5, detail: 'Đang chuẩn bị môi trường & phân tích file...' });

        const videoDuration = await getMediaDuration(originalVideo);
        if (videoDuration === 0) {
            onProgress({ status: 'error', progress: 0, detail: 'Không thể đọc thông tin video gốc!' });
            return null;
        }

        const srtContent = fs.readFileSync(originalSrt, 'utf-8');
        const segments = await buildSegmentMap(srtContent, audioDir, videoDuration);

        if (segments.length === 0) {
            onProgress({ status: 'error', progress: 0, detail: 'Không có phân đoạn nào để xử lý!' });
            return null;
        }

        const tempDir = path.join(projectPath, 'temp_final');
        
        // FIX BUG #4: Register temp directory for cleanup
        tempManager.register(tempDir);
        
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        fs.mkdirSync(tempDir, { recursive: true });

        // Bước 1: Trích xuất / Tổng hợp Full Original Audio (Đồng dạng 44.1kHz, Stereo, PCM)
        onProgress({ status: 'preparing', progress: 10, detail: 'Đang chuẩn bị luồng âm thanh gốc...' });
        const externalAudio = findOriginalAudio(projectPath);
        const vidHasAudio = await hasAudioStream(originalVideo);
        
        const fullAudioWav = path.join(tempDir, 'full_audio.wav');
        let audioPrepResult;

        if (externalAudio) {
            audioPrepResult = await runFfmpeg(['-y', '-i', externalAudio, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', videoDuration.toFixed(3), fullAudioWav]);
        } else if (vidHasAudio) {
            audioPrepResult = await runFfmpeg(['-y', '-i', originalVideo, '-vn', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', videoDuration.toFixed(3), fullAudioWav]);
        } else {
            // Không có auido -> Tạo file silence
            audioPrepResult = await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', videoDuration.toFixed(3), '-c:a', 'pcm_s16le', fullAudioWav]);
        }

        if (!audioPrepResult.success || !fs.existsSync(fullAudioWav)) {
            onProgress({ status: 'error', progress: 15, detail: 'Lỗi khởi tạo âm thanh gốc.' });
            return null;
        }

        // Bước 2: Tạo các chunk Audio
        // FIX: Dynamic CONCURRENCY based on available memory
        const os = require('os');
        const freeMemory = os.freemem();
        const freeMemoryGB = freeMemory / (1024 * 1024 * 1024);
        
        // Check minimum memory requirement
        if (freeMemoryGB < 1.5) {
            onProgress({ status: 'error', progress: 0, detail: `Không đủ RAM! Cần ít nhất 1.5GB RAM trống. Hiện tại: ${freeMemoryGB.toFixed(2)}GB` });
            return null;
        }
        
        // Dynamic concurrency: 4GB+ → 4 concurrent, 2-4GB → 2 concurrent, <2GB → 1 concurrent
        const CONCURRENCY = freeMemoryGB > 4 ? 4 : (freeMemoryGB > 2 ? 2 : 1);
        console.log(`[Memory] Free: ${freeMemoryGB.toFixed(2)}GB, CONCURRENCY: ${CONCURRENCY}`);
        
        const segmentPaths: (string | null)[] = new Array(segments.length).fill(null);
        const segmentTimings: (SegmentTiming | null)[] = new Array(segments.length).fill(null);
        let completed = 0;
        let processError: string | null = null;
        const startTime = Date.now();

        const processAudioSegment = async (seg: Segment, idx: number): Promise<void> => {
            if (isCancelled) throw new Error("Cancelled by user");
            if (processError) throw new Error(processError);

            const outSegWav = path.join(tempDir, `audio_seg_${String(idx).padStart(4, '0')}.wav`);
            const targetDurFixed = seg.targetDuration.toFixed(4);
            const startFixed = seg.videoStart.toFixed(4);
            const origDurFixed = seg.videoDuration.toFixed(4);

            if (seg.type === 'gap') {
                // Skip gaps that are too short (< 0.1s) - they cause FFmpeg extraction issues
                if (seg.videoDuration < 0.1) {
                    console.log(`[Gap] Skipping very short gap segment ${idx} (${seg.videoDuration.toFixed(3)}s)`);
                    // Create a minimal silent audio file instead
                    const res = await runFfmpeg([
                        '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                        '-t', origDurFixed,
                        '-c:a', 'pcm_s16le', outSegWav
                    ]);
                    if (!res.success) {
                        const error = `Lỗi tạo silence cho Gap ngắn (t=${startFixed}): ${res.stderr}`;
                        processError = error;
                        throw new Error(error);
                    }
                    segmentPaths[idx] = outSegWav;
                    
                    const actualDuration = await getMediaDuration(outSegWav);
                    segmentTimings[idx] = {
                        expectedDuration: seg.targetDuration,
                        actualDuration: actualDuration,
                        drift: actualDuration - seg.targetDuration
                    };
                } else {
                    // Use new fade expression helper
                    const volExpr = createFadeExpression(seg, duckVolume, fadeDuration);
                    
                    // Debug logging
                    console.log(`[Gap] Segment ${idx}: duration=${seg.targetDuration.toFixed(3)}s, fadeStart=${seg.fadeStart}, fadeEnd=${seg.fadeEnd}, volExpr=${volExpr}`);
                    
                    if (!validateFadeExpression(volExpr)) {
                        const error = `Invalid fade expression for segment ${idx}`;
                        console.error(`[Fade] ${error}`);
                        processError = error;
                        throw new Error(error);
                    }

                    const res = await runFfmpeg([
                        '-y', '-ss', startFixed, '-t', origDurFixed, '-i', fullAudioWav,
                        '-af', `volume='${volExpr}'`,
                        '-c:a', 'pcm_s16le', outSegWav
                    ]);
                    if (!res.success) {
                        const error = `Lỗi cắt âm Gap (t=${startFixed}): ${res.stderr}`;
                        processError = error;
                        throw new Error(error);
                    }
                    segmentPaths[idx] = outSegWav;
                
                    // Measure actual duration for sync tracking
                    const actualDuration = await getMediaDuration(outSegWav);
                    segmentTimings[idx] = {
                        expectedDuration: seg.targetDuration,
                        actualDuration: actualDuration,
                        drift: actualDuration - seg.targetDuration
                    };

                    // Debug: Log detailed timing info for gap segment
                    console.log(`[Audio] Segment ${idx} (${seg.type}): videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualDur=${actualDuration.toFixed(3)}s, drift=${(actualDuration - seg.targetDuration).toFixed(3)}s`);
                }
            } else {
                // Dubbed
                if (!seg.audioPath || !seg.audioDuration || seg.audioDuration === 0) {
                    const res = await runFfmpeg([
                        '-y', '-ss', startFixed, '-t', origDurFixed, '-i', fullAudioWav,
                        '-c:a', 'pcm_s16le', outSegWav
                    ]);
                    if (!res.success) {
                        const error = `Lỗi Fallback Gap (t=${startFixed}): ${res.stderr}`;
                        processError = error;
                        throw new Error(error);
                    }
                    segmentPaths[idx] = outSegWav;

                    // Measure actual duration for sync tracking (fallback case)
                    const actualDuration = await getMediaDuration(outSegWav);
                    segmentTimings[idx] = {
                        expectedDuration: seg.targetDuration,
                        actualDuration: actualDuration,
                        drift: actualDuration - seg.targetDuration
                    };
                    
                    // Debug: Log detailed timing info for fallback segment
                    console.log(`[Audio] Segment ${idx} (fallback): videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualDur=${actualDuration.toFixed(3)}s, drift=${(actualDuration - seg.targetDuration).toFixed(3)}s`);
                    
                    completed++;
                    const pct = Math.round((completed / segments.length) * 40);
                    onProgress({
                        status: 'processing',
                        progress: 10 + pct,
                        detail: `Đang xử lý âm thanh đoạn ${completed}/${segments.length}...`,
                        current: completed,
                        total: segments.length,
                    });
                    return;
                }

                // Tính toán atempo cho background và dubbed
                const bgSpeed = 1.0 / seg.videoSpeed;
                const bgAtempo = getAtempoFilter(bgSpeed);
                const dubbedAtempo = getAtempoFilter(seg.audioSpeed);

                // Quan trọng: Thêm aresample=44100 để đồng bộ mọi stream trước khi mix
                const bgFilter = bgAtempo ? `aresample=44100,${bgAtempo},volume=${duckVolume}` : `aresample=44100,volume=${duckVolume}`;
                const dubbedFilter = dubbedAtempo ? `aresample=44100,${dubbedAtempo},apad` : 'aresample=44100,apad';
                
                const res = await runFfmpeg([
                    '-y', 
                    '-ss', startFixed, '-t', origDurFixed, '-i', fullAudioWav, // 0:a = Background Audio chunk
                    '-i', seg.audioPath, // 1:a = Dubbed Audio
                    '-filter_complex', `[0:a]${bgFilter}[bg];[1:a]${dubbedFilter}[v];[bg][v]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]`,
                    '-map', '[out]',
                    '-c:a', 'pcm_s16le',
                    '-ar', '44100',
                    '-t', targetDurFixed, // Đảm bảo output có độ dài chính xác targetDuration (sau khi đã co giãn)
                    outSegWav
                ]);

                if (!res.success) {
                    const error = `Lỗi Mix Dubbed #${seg.index}: ${res.stderr}`;
                    processError = error;
                    throw new Error(error);
                }
                segmentPaths[idx] = outSegWav;
                
                // Measure actual duration for sync tracking
                const actualDuration = await getMediaDuration(outSegWav);
                segmentTimings[idx] = {
                    expectedDuration: seg.targetDuration,
                    actualDuration: actualDuration,
                    drift: actualDuration - seg.targetDuration
                };

                // Debug: Log detailed timing info for each segment
                console.log(`[Audio] Segment ${idx} (${seg.type}): videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualDur=${actualDuration.toFixed(3)}s, drift=${(actualDuration - seg.targetDuration).toFixed(3)}s`);
            }

            completed++;
            const pct = Math.round((completed / segments.length) * 40); // 10 -> 50
            onProgress({
                status: 'processing',
                progress: 10 + pct,
                detail: `Đang xử lý âm thanh đoạn ${completed}/${segments.length}...`,
                current: completed,
                total: segments.length,
            });
        };

        // FIX BUG #1: Use p-limit instead of manual worker management
        const limit = pLimit(CONCURRENCY);
        
        const promises = segments.map((seg, idx) => 
            limit(async () => {
                if (isCancelled) throw new Error("Cancelled by user");
                // Don't check processError here - let processAudioSegment handle it
                await processAudioSegment(seg, idx);
            })
        );

        try {
            await Promise.all(promises);
        } catch (err: any) {
            if (err.message === "Cancelled by user") {
                throw err;
            }
            // If there's a processError, use it; otherwise use the caught error
            if (processError) {
                throw new Error(processError);
            }
            throw err;
        }

        const validPaths = segmentPaths.filter((p): p is string => p !== null);
        if (validPaths.length !== segments.length) {
            onProgress({ status: 'error', progress: 0, detail: 'Mất mát / Lỗi khi render phân đoạn âm thanh!' });
            return null;
        }
        
        // FIX BUG #2: Track and report cumulative drift
        let cumulativeDrift = 0;
        const CORRECTION_INTERVAL = 10;
        const DRIFT_THRESHOLD = 0.05;
        
        for (let i = 0; i < segmentTimings.length; i++) {
            if (!segmentTimings[i]) continue;
            cumulativeDrift += segmentTimings[i]!.drift;
            
            if ((i + 1) % CORRECTION_INTERVAL === 0 && Math.abs(cumulativeDrift) > DRIFT_THRESHOLD) {
                console.log(`[Sync] Cumulative drift at segment ${i}: ${cumulativeDrift.toFixed(3)}s`);
            }
        }

        // Bước 3: Concat chuỗi âm thanh
        onProgress({ status: 'concatenating', progress: 55, detail: 'Đang kết dính luồng âm thanh...' });
        const listPath = path.join(tempDir, 'concat_list.txt');
        const listContent = validPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(listPath, listContent, 'utf-8');

        const finalAudioWav = path.join(tempDir, 'final_mixed_audio.wav');
        const concatRes = await runFfmpeg([
            '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'copy', finalAudioWav
        ]);

        if (!concatRes.success || !fs.existsSync(finalAudioWav)) {
            onProgress({ status: 'error', progress: 0, detail: `Lỗi kết nối âm thanh: ${concatRes.stderr}` });
            return null;
        }
        
        // FIX BUG #2: Final verification of audio sync
        const totalExpected = segments.reduce((sum, s) => sum + s.targetDuration, 0);
        const totalActual = await getMediaDuration(finalAudioWav);
        const finalDrift = totalActual - totalExpected;
        
        if (Math.abs(finalDrift) > 0.1) {
            console.warn(`[Sync] Final audio drift: ${finalDrift.toFixed(3)}s (expected: ${totalExpected.toFixed(2)}s, actual: ${totalActual.toFixed(2)}s)`);
            onProgress({
                status: 'concatenating',
                progress: 58,
                detail: `Audio concatenated (drift: ${finalDrift > 0 ? '+' : ''}${finalDrift.toFixed(2)}s)`
            });
        }
        
        // Recalculate video segment timing based on ACTUAL audio duration for EACH segment
        // This ensures each video segment matches its corresponding audio segment timeline
        console.log(`[Video] Recalculating each segment based on actual audio duration...`);
        
        // Build array of actual durations from segmentTimings
        const actualDurations = segmentTimings.map((timing, idx) => {
            if (timing) {
                return timing.actualDuration;
            }
            return segments[idx].targetDuration;
        });
        
        // Log per-segment adjustment
        let totalActualFromSegments = 0;
        for (let i = 0; i < segments.length; i++) {
            const expected = segments[i].targetDuration;
            const actual = actualDurations[i];
            totalActualFromSegments += actual;
            if (expected !== actual) {
                console.log(`[Video] Segment ${i}: expected=${expected.toFixed(3)}s, actual=${actual.toFixed(3)}s, ratio=${(actual/expected).toFixed(4)}`);
            }
        }

        // Bước 4: 1-Pass Video Encode (Chèn Final Audio vào Original Video) với Video Stretching
        onProgress({ status: 'rerendering', progress: 60, detail: 'Đang kết xuất Video cuối cùng (áp dụng co giãn timing)...' });
        
        const outputDir = path.join(projectPath, 'final');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const outputPath = path.join(outputDir, 'final_video.mp4');
        const fps = await getVideoFps(originalVideo);
        
        // NEW APPROACH: Segment-by-segment encoding
        // Each segment is encoded individually, then concatenated
        // This avoids filter_complex issues and enables GPU acceleration
        console.log(`[SegmentEncode] Processing ${segments.length} segments individually...`);
        onProgress({ status: 'rerendering', progress: 60, detail: `Đang xử lý ${segments.length} đoạn video...` });
        
        const segmentVideos: string[] = [];
        const VIDEO_CONCURRENCY = 4; // Process 4 segments in parallel
        const videoLimit = pLimit(VIDEO_CONCURRENCY);
        
        // Function to encode a single segment
        const encodeSegment = async (seg: Segment, index: number): Promise<string | null> => {
            const segmentPath = path.join(tempDir, `segment_${String(index).padStart(4, '0')}.mp4`);
            
            // Use -ss BEFORE -i for accurate seeking (keyframe-aware)
            const args = [
                '-y',
                '-ss', seg.videoStart.toFixed(4),  // Seek BEFORE input
                '-i', originalVideo,
                '-t', seg.videoDuration.toFixed(4)  // Duration to extract
            ];
            
            // Add speed filter if needed
            if (Math.abs(seg.videoSpeed - 1.0) > 0.001) {
                const ptsMultiplier = (1.0 / seg.videoSpeed).toFixed(4);
                args.push('-filter:v', `setpts=${ptsMultiplier}*PTS`);
                console.log(`[Segment ${index}] videoSpeed=${seg.videoSpeed.toFixed(4)}, setpts=${ptsMultiplier}*PTS`);
            } else {
                console.log(`[Segment ${index}] No speed adjustment (videoSpeed=1.0)`);
            }
            
            // Try GPU encoder first
            args.push(...HW_VIDEO_ARGS);
            args.push('-r', fps.toFixed(3));
            args.push('-an', segmentPath);
            
            let res = await runFfmpeg(args);
            
            // Fallback to CPU if GPU fails
            if (!res.success || !fs.existsSync(segmentPath) || fs.statSync(segmentPath).size < 1000) {
                console.warn(`[Segment ${index}] GPU encoding failed, trying CPU...`);
                
                // Retry with CPU encoder
                const cpuArgs = [
                    '-y',
                    '-ss', seg.videoStart.toFixed(4),
                    '-i', originalVideo,
                    '-t', seg.videoDuration.toFixed(4)
                ];
                
                if (Math.abs(seg.videoSpeed - 1.0) > 0.001) {
                    const ptsMultiplier = (1.0 / seg.videoSpeed).toFixed(4);
                    cpuArgs.push('-filter:v', `setpts=${ptsMultiplier}*PTS`);
                }
                
                cpuArgs.push('-c:v', 'libx264', '-crf', '18', '-preset', 'ultrafast');
                cpuArgs.push('-r', fps.toFixed(3));
                cpuArgs.push('-an', segmentPath);
                
                res = await runFfmpeg(cpuArgs);
            }
            
            if (!res.success || !fs.existsSync(segmentPath)) {
                console.error(`[Segment ${index}] Encoding failed`);
                return null;
            }
            
            const segSize = fs.statSync(segmentPath).size;
            if (segSize < 1000) {
                console.error(`[Segment ${index}] File too small: ${segSize} bytes`);
                return null;
            }
            
            console.log(`[Segment ${index}] Encoded: ${(segSize / 1024).toFixed(1)}KB`);
            return segmentPath;
        };
        
        // Encode all segments in parallel
        const encodePromises = segments.map((seg, i) => 
            videoLimit(async () => {
                const result = await encodeSegment(seg, i);
                const progress = 60 + Math.round(((i + 1) / segments.length) * 25);
                onProgress({ status: 'rerendering', progress, detail: `Đã xử lý ${i + 1}/${segments.length} đoạn...` });
                return result;
            })
        );
        
        const encodedSegments = await Promise.all(encodePromises);
        
        // Check if all segments encoded successfully
        const failedSegments = encodedSegments.filter(s => s === null);
        if (failedSegments.length > 0) {
            console.error(`[SegmentEncode] ${failedSegments.length} segments failed to encode`);
            onProgress({ status: 'error', progress: 0, detail: `${failedSegments.length} đoạn video không encode được!` });
            return null;
        }
        
        segmentVideos.push(...encodedSegments.filter(s => s !== null) as string[]);
        
        // Concatenate all segments
        console.log(`[Concat] Merging ${segmentVideos.length} segments...`);
        onProgress({ status: 'rerendering', progress: 85, detail: 'Đang gộp các đoạn video...' });
        
        const concatListPath = path.join(tempDir, 'segment_concat_list.txt');
        const concatListContent = segmentVideos.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(concatListPath, concatListContent, 'utf-8');
        
        const mergedVideoPath = path.join(tempDir, 'merged_video.mp4');
        const mergeRes = await runFfmpeg([
            '-y', '-f', 'concat', '-safe', '0', '-i', concatListPath,
            '-c:v', 'copy',  // No re-encoding
            mergedVideoPath
        ]);
        
        if (!mergeRes.success || !fs.existsSync(mergedVideoPath)) {
            onProgress({ status: 'error', progress: 0, detail: 'Lỗi khi gộp các đoạn video!' });
            return null;
        }
        
        // Final mux with audio
        console.log(`[Mux] Adding audio to merged video...`);
        onProgress({ status: 'rerendering', progress: 90, detail: 'Đang thêm âm thanh vào video...' });
        
        const finalMuxRes = await runFfmpeg([
            '-y',
            '-i', mergedVideoPath,
            '-i', finalAudioWav,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '192k',
            '-map', '0:v:0',
            '-map', '1:a:0',
            outputPath
        ]);
        
        if (!finalMuxRes.success || !fs.existsSync(outputPath)) {
            onProgress({ status: 'error', progress: 0, detail: 'Lỗi khi thêm âm thanh vào video!' });
            return null;
        }
        
        const encodeRes = true;

        // Cleanup temp segment files
        console.log('[Cleanup] Cleaning up temporary segment files...');
        try {
            const segmentFiles = fs.readdirSync(tempDir).filter(f => f.startsWith('segment_'));
            for (const file of segmentFiles) {
                try {
                    fs.unlinkSync(path.join(tempDir, file));
                } catch (e) {
                    console.warn(`[Cleanup] Failed to remove ${file}:`, e);
                }
            }
        } catch (e) {
            console.warn('[Cleanup] Failed to cleanup segment files:', e);
        }
        
        tempManager.unregister(tempDir);
        await tempManager.cleanup();

        if (!encodeRes || !fs.existsSync(outputPath)) {
            onProgress({ status: 'error', progress: 0, detail: 'Lỗi khi gắn luồng âm thanh vào video!' });
            return null;
        }

        const totalTime = Math.round((Date.now() - startTime) / 1000);
        onProgress({ status: 'done', progress: 100, detail: `Hoạt tất tuyệt đối! Render mất ${totalTime}s.` });

        return outputPath;

    } catch (err: any) {
        // FIX BUG #4: Cleanup on error
        const tempDir = path.join(projectPath, 'temp_final');
        tempManager.unregister(tempDir);
        await tempManager.cleanup();
        
        if (err.message === "Cancelled by user") {
            onProgress({ status: 'error', progress: 0, detail: `Đã huỷ xuất video!` });
            return null;
        }
        console.error('Create final video failed:', err);
        onProgress({ status: 'error', progress: 0, detail: `Lỗi System: ${err}` });
        return null;
    }
};
