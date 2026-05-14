"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadVideo = exports.getVideoFormats = exports.getVideoInfo = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const EnvironmentService_1 = require("./EnvironmentService");
const ensureDir = (dir) => {
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
};
const formatUploadDate = (uploadDate) => {
    if (uploadDate === undefined || uploadDate === null)
        return '';
    const value = String(uploadDate);
    if (!/^\d{8}$/.test(value))
        return '';
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};
const getVideoInfo = async (url) => {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = (0, EnvironmentService_1.getYtDlpPath)();
            const proc = (0, child_process_1.spawn)(ytDlpPath, [
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
                    const info = JSON.parse(stdout);
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
                }
                catch (e) {
                    console.error('Failed to parse yt-dlp output:', e);
                    resolve(null);
                }
            });
            proc.on('error', (err) => {
                console.error('yt-dlp spawn error:', err);
                resolve(null);
            });
        }
        catch (error) {
            console.error("Error getting video info:", error);
            resolve(null);
        }
    });
};
exports.getVideoInfo = getVideoInfo;
const getVideoFormats = async (url) => {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = (0, EnvironmentService_1.getYtDlpPath)();
            const proc = (0, child_process_1.spawn)(ytDlpPath, [
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
                const formats = [];
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    const parts = line.split('|');
                    if (parts.length < 8)
                        continue;
                    const [id, ext, resolution, codec, filesize, bitrate, fps, note] = parts;
                    // Only show formats with video
                    if (resolution === 'audio only' || !resolution)
                        continue;
                    formats.push({ id: id.trim(), ext, resolution, codec, filesize, bitrate, fps, note });
                }
                resolve(formats);
            });
            proc.on('error', () => resolve([]));
        }
        catch {
            resolve([]);
        }
    });
};
exports.getVideoFormats = getVideoFormats;
const downloadVideo = async (url, projectPath, onProgress, formatId) => {
    return new Promise((resolve) => {
        try {
            const videoDir = path_1.default.join(projectPath, 'original', 'video');
            const audioDir = path_1.default.join(projectPath, 'original', 'audio');
            ensureDir(videoDir);
            ensureDir(audioDir);
            const ytDlpPath = (0, EnvironmentService_1.getYtDlpPath)();
            const ffmpegPath = (0, EnvironmentService_1.getFfmpegPath)();
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
            const parseProgress = (data) => {
                const match = data.match(/\[download\]\s+(\d+\.?\d*)%/);
                if (match) {
                    return parseFloat(match[1]);
                }
                return null;
            };
            const videoFormat = formatId || 'bestvideo[ext=mp4][vcodec^=avc1]/bestvideo[ext=mp4]/bestvideo';
            const videoProc = (0, child_process_1.spawn)(ytDlpPath, [
                '-f', videoFormat,
                '--ffmpeg-location', ffmpegPath,
                '-o', path_1.default.join(videoDir, '%(id)s.%(ext)s'),
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
            const audioProc = (0, child_process_1.spawn)(ytDlpPath, [
                '-f', 'bestaudio[ext=m4a]/bestaudio',
                '--ffmpeg-location', ffmpegPath,
                '--extract-audio',
                '--audio-format', 'mp3',
                '-o', path_1.default.join(audioDir, '%(id)s.%(ext)s'),
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
        }
        catch (error) {
            console.error("Download failed:", error);
            resolve(false);
        }
    });
};
exports.downloadVideo = downloadVideo;
//# sourceMappingURL=VideoService.js.map