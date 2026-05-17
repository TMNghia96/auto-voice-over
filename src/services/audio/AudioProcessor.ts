import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import pLimit from 'p-limit';
import { getFfmpegPath } from '../EnvironmentService';

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

let activeProcesses: ReturnType<typeof spawn>[] = [];
let isCancelled = false;

export const cancelAudioProcessing = () => {
    isCancelled = true;
    for (const proc of activeProcesses) {
        try {
            if (process.platform === 'win32' && proc.pid) {
                const { exec } = require('child_process');
                exec(`taskkill /pid ${proc.pid} /t /f`);
            } else {
                proc.kill('SIGKILL');
            }
        } catch (e) {}
    }
    activeProcesses = [];
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

export class AudioProcessor {
    private duckVolume: number;
    private ffmpegPath: string;

    constructor(ffmpegPath: string, duckVolume: number = 0.15) {
        this.ffmpegPath = ffmpegPath;
        this.duckVolume = duckVolume;
    }

    private runFfmpeg(args: string[]): Promise<{ success: boolean; stderr: string }> {
        return new Promise((resolve) => {
            if (isCancelled) return resolve({ success: false, stderr: 'Cancelled' });
            const proc = spawn(this.ffmpegPath, args, { windowsHide: true });
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
    }

    private getMediaDuration(filePath: string): Promise<number> {
        return new Promise((resolve) => {
            const proc = spawn(this.ffmpegPath, ['-i', filePath, '-f', 'null', '-'], { windowsHide: true });

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
    }

    async processAudioSegments(
        segments: Segment[],
        fullAudioWav: string,
        tempDir: string,
        onProgress: (progress: number) => void
    ): Promise<{
        segmentPaths: string[],
        actualDurations: number[]
    }> {
        // Dynamic CONCURRENCY based on available memory
        const os = require('os');
        const freeMemory = os.freemem();
        const freeMemoryGB = freeMemory / (1024 * 1024 * 1024);
        
        // Check minimum memory requirement
        if (freeMemoryGB < 1.5) {
            throw new Error(`Không đủ RAM! Cần ít nhất 1.5GB RAM trống. Hiện tại: ${freeMemoryGB.toFixed(2)}GB`);
        }
        
        // Dynamic concurrency: 4GB+ → 4 concurrent, 2-4GB → 2 concurrent, <2GB → 1 concurrent
        const CONCURRENCY = freeMemoryGB > 4 ? 4 : (freeMemoryGB > 2 ? 2 : 1);
        console.log(`[Memory] Free: ${freeMemoryGB.toFixed(2)}GB, CONCURRENCY: ${CONCURRENCY}`);
        
        const segmentPaths: (string | null)[] = new Array(segments.length).fill(null);
        const segmentTimings: (SegmentTiming | null)[] = new Array(segments.length).fill(null);
        let completed = 0;
        let processError: string | null = null;

        const processAudioSegment = async (seg: Segment, idx: number): Promise<void> => {
            if (isCancelled) throw new Error("Cancelled by user");
            if (processError) throw new Error(processError);

            const outSegWav = path.join(tempDir, `audio_seg_${String(idx).padStart(4, '0')}.wav`);
            const targetDurFixed = seg.targetDuration.toFixed(4);
            const startFixed = seg.videoStart.toFixed(4);
            const origDurFixed = seg.videoDuration.toFixed(4);

            if (seg.type === 'gap') {
                // Gap segments: constant duck volume (same as dubbed background)
                const res = await this.runFfmpeg([
                    '-y', '-ss', startFixed, '-t', origDurFixed, '-i', fullAudioWav,
                    '-af', `volume=${this.duckVolume}`,
                    '-c:a', 'pcm_s16le', outSegWav
                ]);
                if (!res.success) {
                    const error = `Lỗi cắt âm Gap (t=${startFixed}): ${res.stderr}`;
                    processError = error;
                    throw new Error(error);
                }
                segmentPaths[idx] = outSegWav;
            
                // Measure actual duration for sync tracking
                const actualDuration = await this.getMediaDuration(outSegWav);
                segmentTimings[idx] = {
                    expectedDuration: seg.targetDuration,
                    actualDuration: actualDuration,
                    drift: actualDuration - seg.targetDuration
                };

                // Debug: Log detailed timing info for gap segment
                console.log(`[Audio] Segment ${idx} (${seg.type}): videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualDur=${actualDuration.toFixed(3)}s, drift=${(actualDuration - seg.targetDuration).toFixed(3)}s`)
            } else {
                // Dubbed
                if (!seg.audioPath || !seg.audioDuration || seg.audioDuration === 0) {
                    const res = await this.runFfmpeg([
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
                    const actualDuration = await this.getMediaDuration(outSegWav);
                    segmentTimings[idx] = {
                        expectedDuration: seg.targetDuration,
                        actualDuration: actualDuration,
                        drift: actualDuration - seg.targetDuration
                    };
                    
                    // Debug: Log detailed timing info for fallback segment
                    console.log(`[Audio] Segment ${idx} (fallback): videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualDur=${actualDuration.toFixed(3)}s, drift=${(actualDuration - seg.targetDuration).toFixed(3)}s`);
                    
                    completed++;
                    const pct = Math.round((completed / segments.length) * 100);
                    onProgress(pct);
                    return;
                }

                // Tính toán atempo cho background và dubbed
                const bgSpeed = 1.0 / seg.videoSpeed;
                const bgAtempo = getAtempoFilter(bgSpeed);
                const dubbedAtempo = getAtempoFilter(seg.audioSpeed);

                // Quan trọng: Thêm aresample=44100 để đồng bộ mọi stream trước khi mix
                const bgFilter = bgAtempo ? `aresample=44100,${bgAtempo},volume=${this.duckVolume}` : `aresample=44100,volume=${this.duckVolume}`;
                const dubbedFilter = dubbedAtempo ? `aresample=44100,${dubbedAtempo},apad` : 'aresample=44100,apad';
                
                const res = await this.runFfmpeg([
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
                const actualDuration = await this.getMediaDuration(outSegWav);
                segmentTimings[idx] = {
                    expectedDuration: seg.targetDuration,
                    actualDuration: actualDuration,
                    drift: actualDuration - seg.targetDuration
                };

                // Debug: Log detailed timing info for each segment
                console.log(`[Audio] Segment ${idx} (${seg.type}): videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualDur=${actualDuration.toFixed(3)}s, drift=${(actualDuration - seg.targetDuration).toFixed(3)}s`);
            }

            completed++;
            const pct = Math.round((completed / segments.length) * 100);
            onProgress(pct);
        };

        // Use p-limit for concurrency control
        const limit = pLimit(CONCURRENCY);
        
        const promises = segments.map((seg, idx) => 
            limit(async () => {
                if (isCancelled) throw new Error("Cancelled by user");
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
            throw new Error('Mất mát / Lỗi khi render phân đoạn âm thanh!');
        }
        
        // Track cumulative drift
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

        // Build array of actual durations from segmentTimings
        const actualDurations = segmentTimings.map((timing, idx) => {
            if (timing) {
                return timing.actualDuration;
            }
            return segments[idx].targetDuration;
        });

        return {
            segmentPaths: validPaths,
            actualDurations
        };
    }

    async concatenateAudio(
        segmentPaths: string[],
        tempDir: string,
        expectedDuration?: number
    ): Promise<string> {
        const listPath = path.join(tempDir, 'concat_list.txt');
        const listContent = segmentPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(listPath, listContent, 'utf-8');

        const finalAudioWav = path.join(tempDir, 'final_mixed_audio.wav');
        const filters = ['aresample=async=1:first_pts=0'];
        if (expectedDuration && expectedDuration > 0) {
            const expectedFixed = expectedDuration.toFixed(4);
            filters.push(`apad,atrim=0:${expectedFixed}`);
        }

        const concatRes = await this.runFfmpeg([
            '-y',
            '-fflags', '+genpts',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-vn',
            '-af', filters.join(','),
            '-ar', '44100',
            '-ac', '2',
            '-c:a', 'pcm_s16le',
            finalAudioWav
        ]);

        if (!concatRes.success || !fs.existsSync(finalAudioWav)) {
            throw new Error(`Lỗi kết nối âm thanh: ${concatRes.stderr}`);
        }

        if (expectedDuration && expectedDuration > 0) {
            const actualDuration = await this.getMediaDuration(finalAudioWav);
            const drift = actualDuration - expectedDuration;
            console.log(`[Audio] Concatenated duration: expected=${expectedDuration.toFixed(3)}s, actual=${actualDuration.toFixed(3)}s, drift=${drift.toFixed(3)}s`);

            if (actualDuration === 0 || Math.abs(drift) > 0.25) {
                throw new Error(
                    `Âm thanh sau khi gộp lệch ${drift.toFixed(3)}s so với video (expected=${expectedDuration.toFixed(3)}s, actual=${actualDuration.toFixed(3)}s)`
                );
            }
        }

        return finalAudioWav;
    }
}
