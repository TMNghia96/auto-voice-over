import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getYtDlpPath, getFfmpegPath } from './EnvironmentService';

const ensureDir = (dir: string) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

export interface VideoInfo {
    title: string;
    thumbnail: string;
    duration: number;
    id: string;
    url: string;
    author: string;
    viewCount: number;
    uploadDate: string;
    description: string;
    isLive: boolean;
}

export interface VideoFormat {
    id: string;
    ext: string;
    resolution: string;
    codec: string;
    filesize: string;
    bitrate: string;
    fps: string;
    note: string;
}

interface YtDlpDumpJson {
    title?: string;
    thumbnail?: string;
    duration?: number;
    id?: string;
    webpage_url?: string;
    original_url?: string;
    uploader?: string;
    channel?: string;
    view_count?: number;
    upload_date?: string | number;
    description?: string;
    is_live?: boolean;
}

const formatUploadDate = (uploadDate?: string | number): string => {
    if (uploadDate === undefined || uploadDate === null) return '';
    const value = String(uploadDate);
    if (!/^\d{8}$/.test(value)) return '';
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};

export const getVideoInfo = async (url: string): Promise<VideoInfo | null> => {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = getYtDlpPath();
            const proc = spawn(ytDlpPath, [
                '--dump-json',
                '--no-download',
                url
            ]);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code !== 0) {
                    console.error('yt-dlp info error:', stderr);
                    resolve(null);
                    return;
                }

                try {
                    const info = JSON.parse(stdout) as YtDlpDumpJson;
                    resolve({
                        title: info.title || '',
                        thumbnail: info.thumbnail || '',
                        duration: typeof info.duration === 'number' ? info.duration : 0,
                        id: info.id || '',
                        url: info.webpage_url || info.original_url || url,
                        author: info.uploader || info.channel || '',
                        viewCount: typeof info.view_count === 'number' ? info.view_count : 0,
                        uploadDate: formatUploadDate(info.upload_date),
                        description: info.description || '',
                        isLive: Boolean(info.is_live),
                    });
                } catch (e) {
                    console.error('Failed to parse yt-dlp output:', e);
                    resolve(null);
                }
            });

            proc.on('error', (err) => {
                console.error('yt-dlp spawn error:', err);
                resolve(null);
            });
        } catch (error) {
            console.error("Error getting video info:", error);
            resolve(null);
        }
    });
};

export const getVideoFormats = async (url: string): Promise<VideoFormat[]> => {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = getYtDlpPath();
            const proc = spawn(ytDlpPath, [
                '-F',
                '--print', '%(format_id)s|%(ext)s|%(resolution)s|%(vcodec)s|%(filesize_approx)s|%(tbr)s|%(fps)s|%(format_note)s',
                url
            ]);

            let stdout = '';
            proc.stdout.on('data', (data) => stdout += data.toString());

            proc.on('close', (code) => {
                if (code !== 0) {
                    resolve([]);
                    return;
                }
                const formats: VideoFormat[] = [];
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    const parts = line.split('|');
                    if (parts.length < 8) continue;
                    const [id, ext, resolution, codec, filesize, bitrate, fps, note] = parts;
                    // Only show formats with video
                    if (resolution === 'audio only' || !resolution) continue;
                    formats.push({ id: id.trim(), ext, resolution, codec, filesize, bitrate, fps, note });
                }
                resolve(formats);
            });

            proc.on('error', () => resolve([]));
        } catch {
            resolve([]);
        }
    });
};

export const downloadVideo = async (
    url: string,
    projectPath: string,
    onProgress: (progress: { video: number, audio: number }) => void,
    formatId?: string
): Promise<boolean> => {
    return new Promise((resolve) => {
        try {
            const videoDir = path.join(projectPath, 'original', 'video');
            const audioDir = path.join(projectPath, 'original', 'audio');
            ensureDir(videoDir);
            ensureDir(audioDir);

            const ytDlpPath = getYtDlpPath();
            const ffmpegPath = getFfmpegPath();

            let videoProgress = 0;
            let audioProgress = 0;
            let videoFinished = false;
            let audioFinished = false;
            let videoSucceeded = false;
            let audioSucceeded = false;

            const checkDone = () => {
                if (videoFinished && audioFinished) {
                    onProgress({ video: 100, audio: 100 });
                    resolve(videoSucceeded && audioSucceeded);
                }
            };

            const reportProgress = () => {
                onProgress({ video: videoProgress, audio: audioProgress });
            };

            const parseProgress = (data: string): number | null => {
                const match = data.match(/\[download\]\s+(\d+\.?\d*)%/);
                if (match) {
                    return parseFloat(match[1]);
                }
                return null;
            };

            const videoFormat = formatId || 'bestvideo[ext=mp4][vcodec^=avc1]/bestvideo[ext=mp4]/bestvideo';
            const videoProc = spawn(ytDlpPath, [
                '-f', videoFormat,
                '--ffmpeg-location', ffmpegPath,
                '-o', path.join(videoDir, '%(id)s.%(ext)s'),
                '--newline',
                '--no-part', // Avoid .part files for smoother progress tracking?
                url
            ]);

            videoProc.stdout.on('data', (data) => {
                const text = data.toString();
                const pct = parseProgress(text);
                if (pct !== null) {
                    videoProgress = pct;
                    reportProgress();
                }
            });

            videoProc.stderr.on('data', (data) => {
                const text = data.toString();
                const pct = parseProgress(text);
                if (pct !== null) {
                    videoProgress = pct;
                    reportProgress();
                }
            });

            videoProc.on('close', (code) => {
                console.log('Video download finished, exit code:', code);
                videoSucceeded = code === 0;
                videoProgress = videoSucceeded ? 100 : 0;
                videoFinished = true;
                reportProgress();
                checkDone();
            });

            videoProc.on('error', (err) => {
                console.error('Video download error:', err);
                videoFinished = true; // Mark finished to avoid hanging? Or resolve false?
                videoSucceeded = false;
                videoProgress = 0; // or 100?
                checkDone();
            });

            const audioProc = spawn(ytDlpPath, [
                '-f', 'bestaudio[ext=m4a]/bestaudio',
                '--ffmpeg-location', ffmpegPath,
                '--extract-audio',
                '--audio-format', 'mp3',
                '-o', path.join(audioDir, '%(id)s.%(ext)s'),
                '--newline',
                '--no-part',
                url
            ]);

            audioProc.stdout.on('data', (data) => {
                const text = data.toString();
                const pct = parseProgress(text);
                if (pct !== null) {
                    audioProgress = pct;
                    reportProgress();
                }
            });

            audioProc.stderr.on('data', (data) => {
                const text = data.toString();
                const pct = parseProgress(text);
                if (pct !== null) {
                    audioProgress = pct;
                    reportProgress();
                }
            });

            audioProc.on('close', (code) => {
                console.log('Audio download finished, exit code:', code);
                audioSucceeded = code === 0;
                audioProgress = audioSucceeded ? 100 : 0;
                audioFinished = true;
                reportProgress();
                checkDone();
            });

            audioProc.on('error', (err) => {
                console.error('Audio download error:', err);
                audioFinished = true;
                audioSucceeded = false;
                checkDone();
            });

        } catch (error) {
            console.error("Download failed:", error);
            resolve(false);
        }
    });
};
