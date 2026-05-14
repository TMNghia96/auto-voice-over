"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFinalVideo = exports.cancelFinalVideo = exports.isCancelled = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const EnvironmentService_1 = require("./EnvironmentService");
const TempFileManager_1 = require("./TempFileManager");
const AudioSegmentBuilder_1 = require("./audio/AudioSegmentBuilder");
const AudioProcessor_1 = require("./audio/AudioProcessor");
const EncoderFactory_1 = require("./video/encoders/EncoderFactory");
const SegmentValidator_1 = require("./video/SegmentValidator");
const VideoProcessor_1 = require("./video/VideoProcessor");
const SrtTimelineExporter_1 = require("./srt/SrtTimelineExporter");
let activeProcesses = [];
exports.isCancelled = false;
const cancelFinalVideo = () => {
    exports.isCancelled = true;
    (0, AudioProcessor_1.cancelAudioProcessing)();
    for (const proc of activeProcesses) {
        try {
            if (process.platform === 'win32' && proc.pid) {
                (0, child_process_1.exec)(`taskkill /pid ${proc.pid} /t /f`);
            }
            else {
                proc.kill('SIGKILL');
            }
        }
        catch (e) { }
    }
    activeProcesses = [];
};
exports.cancelFinalVideo = cancelFinalVideo;
const getVideoMetadata = async (filePath) => {
    return new Promise((resolve) => {
        if (exports.isCancelled)
            return resolve({ duration: 0, hasAudio: false, codec: 'unknown' });
        // Prefer ffprobe (fast, no scan) over ffmpeg (may scan entire file if moov at end)
        const ffprobePath = (0, EnvironmentService_1.getFfprobePath)();
        const useFfprobe = fs_1.default.existsSync(ffprobePath);
        const binPath = useFfprobe ? ffprobePath : (0, EnvironmentService_1.getFfmpegPath)();
        const args = useFfprobe
            ? ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type', '-of', 'csv=p=0', filePath]
            : ['-i', filePath, '-f', 'null', '-'];
        const proc = (0, child_process_1.spawn)(binPath, args, { windowsHide: true });
        activeProcesses.push(proc);
        let resolved = false;
        const resolveOnce = (result) => {
            if (resolved)
                return;
            resolved = true;
            resolve(result);
        };
        const timeout = setTimeout(() => {
            if (process.platform === 'win32' && proc.pid) {
                const { exec } = require('child_process');
                exec(`taskkill /pid ${proc.pid} /t /f`);
            }
            else {
                try {
                    proc.kill('SIGKILL');
                }
                catch { }
            }
            activeProcesses = activeProcesses.filter(p => p !== proc);
            console.warn(`[getVideoMetadata] Timeout reading ${filePath}`);
            resolveOnce({ duration: 0, hasAudio: false, codec: 'unknown' });
        }, 30000);
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => stdout += data.toString());
        proc.stderr.on('data', (data) => stderr += data.toString());
        proc.on('close', () => {
            clearTimeout(timeout);
            activeProcesses = activeProcesses.filter(p => p !== proc);
            let duration = 0;
            let hasAudio = false;
            let codec = 'unknown';
            if (useFfprobe) {
                // ffprobe output: stream codec_types then format duration (all lines)
                // Example: "video\r\n1316.948967\r\n"
                const output = stdout.trim() || stderr.trim();
                const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                console.log(`[getVideoMetadata] ffprobe stdout(${stdout.length}):`, JSON.stringify(stdout.slice(0, 200)));
                console.log(`[getVideoMetadata] ffprobe stderr(${stderr.length}):`, JSON.stringify(stderr.slice(0, 200)));
                // Find the duration line (a pure number)
                for (const line of lines) {
                    const d = parseFloat(line);
                    if (!isNaN(d) && d > 0) {
                        duration = d;
                        break;
                    }
                }
                hasAudio = lines.some(line => line.includes('audio'));
                // Fallback: if ffprobe failed, try parsing stderr like ffmpeg
                if (duration === 0 && stderr) {
                    const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
                    if (durMatch) {
                        duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3]) + parseFloat(`0.${durMatch[4]}`);
                    }
                    hasAudio = /Stream.*Audio/i.test(stderr);
                }
                // Parse codec: check stdout first (ffprobe), then stderr (ffmpeg), then combined
                const allOutput = (stdout + stderr).toLowerCase();
                if (allOutput.includes('h264') || allOutput.includes('avc1'))
                    codec = 'h264';
                else if (allOutput.includes('av1') || allOutput.includes('av01'))
                    codec = 'av1';
                else if (allOutput.includes('hevc') || allOutput.includes('hvc1'))
                    codec = 'hevc';
                else if (allOutput.includes('vp9') || allOutput.includes('vp09'))
                    codec = 'vp9';
            }
            else {
                // ffmpeg: parse Duration from stderr, detect Audio stream
                const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
                if (durationMatch) {
                    const hours = parseInt(durationMatch[1]);
                    const minutes = parseInt(durationMatch[2]);
                    const seconds = parseInt(durationMatch[3]);
                    const decimals = parseFloat(`0.${durationMatch[4]}`);
                    duration = hours * 3600 + minutes * 60 + seconds + decimals;
                }
                hasAudio = /Stream\s+#.*Audio:/i.test(stderr);
                // Parse codec from stderr (contains Video: line)
                const rawCodec = stderr.match(/Video:\s*(\w+)/i);
                if (rawCodec)
                    codec = rawCodec[1].toLowerCase();
            }
            console.log(`[getVideoMetadata] ${filePath}: duration=${duration.toFixed(2)}s, hasAudio=${hasAudio}, codec=${codec} (${useFfprobe ? 'ffprobe' : 'ffmpeg'})`);
            resolveOnce({ duration, hasAudio, codec });
        });
        proc.on('error', (err) => {
            clearTimeout(timeout);
            activeProcesses = activeProcesses.filter(p => p !== proc);
            console.error(`[getVideoMetadata] Error: ${err.message}`);
            resolveOnce({ duration: 0, hasAudio: false, codec: 'unknown' });
        });
    });
};
const runFfmpeg = (args) => {
    return new Promise((resolve) => {
        if (exports.isCancelled)
            return resolve({ success: false, stderr: 'Cancelled' });
        const ffmpeg = (0, EnvironmentService_1.getFfmpegPath)();
        const proc = (0, child_process_1.spawn)(ffmpeg, args, { windowsHide: true });
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
const findOriginalAudio = (projectPath) => {
    const audioDir = path_1.default.join(projectPath, 'original', 'audio');
    if (!fs_1.default.existsSync(audioDir))
        return null;
    const files = fs_1.default.readdirSync(audioDir);
    const audioFile = files.find(f => /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f));
    return audioFile ? path_1.default.join(audioDir, audioFile) : null;
};
const findOriginalVideo = (projectPath) => {
    const videoDir = path_1.default.join(projectPath, 'original', 'video');
    if (!fs_1.default.existsSync(videoDir))
        return null;
    const files = fs_1.default.readdirSync(videoDir);
    const videoFile = files.find(f => /\.(mp4|mkv|webm|avi|mov)$/i.test(f));
    return videoFile ? path_1.default.join(videoDir, videoFile) : null;
};
const resolveTranslatedSrt = (projectPath, lang) => {
    const translateDir = path_1.default.join(projectPath, 'translate');
    if (!fs_1.default.existsSync(translateDir))
        return null;
    const srtFiles = fs_1.default.readdirSync(translateDir).filter(f => f.endsWith('.srt'));
    if (srtFiles.length === 0)
        return null;
    if (lang) {
        const target = srtFiles.find(f => path_1.default.basename(f, '.srt') === lang);
        return target ? path_1.default.join(translateDir, target) : null;
    }
    return path_1.default.join(translateDir, srtFiles[0]);
};
const buildVideoChunks = (segments) => {
    const chunks = [];
    let i = 0;
    while (i < segments.length) {
        const seg = segments[i];
        const currentSpeed = seg.adjustedVideoSpeed ?? seg.videoSpeed ?? 1.0;
        let j = i + 1;
        // Merge consecutive segments with same speed
        while (j < segments.length) {
            const nextSpeed = segments[j].adjustedVideoSpeed ?? segments[j].videoSpeed ?? 1.0;
            if (Math.abs(nextSpeed - currentSpeed) < 0.001) {
                j++;
            }
            else {
                break;
            }
        }
        const last = segments[j - 1];
        chunks.push({
            videoStart: seg.videoStart,
            videoEnd: last.videoEnd,
            videoDuration: last.videoEnd - seg.videoStart,
            adjustedVideoSpeed: currentSpeed,
        });
        i = j;
    }
    console.log(`[FinalVideoService] Merged ${segments.length} segments → ${chunks.length} video chunks (${chunks.filter(c => Math.abs(c.adjustedVideoSpeed - 1.0) > 0.001).length} need re-encode)`);
    return chunks;
};
const createFinalVideo = async (projectPath, onProgress, duckVolume = 0.15, config) => {
    try {
        exports.isCancelled = false;
        activeProcesses = [];
        const startTime = Date.now();
        // Validate ffmpeg exists
        const ffmpegPath = (0, EnvironmentService_1.getFfmpegPath)();
        if (!fs_1.default.existsSync(ffmpegPath)) {
            onProgress({
                status: 'error',
                progress: 0,
                detail: 'FFmpeg chưa được cài đặt! Vui lòng chạy Setup Environment từ trang chủ.'
            });
            return null;
        }
        // Merge config with defaults
        const finalConfig = {
            duckVolume,
            encoderPreference: 'gpu', // GPU now works with 256x256 test resolution
            ...config
        };
        // Check GPU availability and log
        onProgress({ status: 'preparing', progress: 2, detail: 'Đang kiểm tra GPU...' });
        const encoderFactory = new EncoderFactory_1.EncoderFactory(finalConfig.encoderPreference || 'gpu');
        const encoder = await encoderFactory.createEncoder();
        console.log(`[FinalVideoService] Using encoder: ${encoder.name} (${encoder.type})`);
        if (encoder.type === 'cpu' && finalConfig.encoderPreference === 'gpu') {
            console.warn('[FinalVideoService] ⚠️ GPU requested but not available, using CPU');
            onProgress({
                status: 'preparing',
                progress: 4,
                detail: '⚠️ GPU không khả dụng, sử dụng CPU...'
            });
        }
        else if (encoder.type === 'gpu') {
            onProgress({
                status: 'preparing',
                progress: 4,
                detail: `🚀 Sử dụng GPU: ${encoder.name.toUpperCase()}`
            });
        }
        // 1. Setup - Find original files
        console.log('[FinalVideoService] Step 1: Finding original files...');
        onProgress({ status: 'preparing', progress: 5, detail: 'Đang tìm file gốc...' });
        const originalVideo = findOriginalVideo(projectPath);
        console.log('[FinalVideoService] Original video:', originalVideo);
        if (!originalVideo) {
            onProgress({ status: 'error', progress: 0, detail: 'Không tìm thấy video gốc!' });
            return null;
        }
        // ✅ Get video metadata once (duration + hasAudio)
        console.log('[FinalVideoService] Getting video metadata...');
        let videoMeta;
        try {
            videoMeta = await getVideoMetadata(originalVideo);
        }
        catch (err) {
            console.error('[FinalVideoService] getVideoMetadata failed:', err);
            onProgress({ status: 'error', progress: 0, detail: 'Không thể đọc thông tin video gốc!' });
            return null;
        }
        console.log('[FinalVideoService] Video metadata:', videoMeta);
        if (videoMeta.duration === 0) {
            onProgress({ status: 'error', progress: 0, detail: 'Không thể đọc thông tin video gốc!' });
            return null;
        }
        const videoDuration = videoMeta.duration;
        const vidHasAudio = videoMeta.hasAudio;
        console.log('[FinalVideoService] Video duration:', videoDuration, 'hasAudio:', vidHasAudio);
        const tempDir = path_1.default.join(projectPath, 'temp_final');
        // Clean up existing temp directory
        if (fs_1.default.existsSync(tempDir)) {
            try {
                fs_1.default.rmSync(tempDir, { recursive: true, force: true });
            }
            catch (err) {
                console.warn('[FinalVideoService] Failed to remove existing temp dir:', err);
            }
        }
        // Wait a bit for Windows to release file locks
        await new Promise(resolve => setTimeout(resolve, 100));
        // Create fresh temp directory
        fs_1.default.mkdirSync(tempDir, { recursive: true });
        TempFileManager_1.tempManager.register(tempDir);
        // 2. Build segment map
        onProgress({ status: 'preparing', progress: 10, detail: 'Đang phân tích phân đoạn...' });
        const segmentBuilder = new AudioSegmentBuilder_1.AudioSegmentBuilder();
        const segments = await segmentBuilder.buildSegmentMap(projectPath, videoDuration);
        if (segments.length === 0) {
            onProgress({ status: 'error', progress: 0, detail: 'Không có phân đoạn nào để xử lý!' });
            return null;
        }
        // 3. Prepare full audio
        onProgress({ status: 'preparing', progress: 15, detail: 'Đang chuẩn bị luồng âm thanh gốc...' });
        const externalAudio = findOriginalAudio(projectPath);
        const fullAudioWav = path_1.default.join(tempDir, 'full_audio.wav');
        let audioPrepResult;
        if (externalAudio) {
            audioPrepResult = await runFfmpeg(['-y', '-i', externalAudio, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', videoDuration.toFixed(3), fullAudioWav]);
        }
        else if (vidHasAudio) {
            audioPrepResult = await runFfmpeg(['-y', '-i', originalVideo, '-vn', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', videoDuration.toFixed(3), fullAudioWav]);
        }
        else {
            audioPrepResult = await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', videoDuration.toFixed(3), '-c:a', 'pcm_s16le', fullAudioWav]);
        }
        if (!audioPrepResult.success || !fs_1.default.existsSync(fullAudioWav)) {
            onProgress({ status: 'error', progress: 15, detail: 'Lỗi khởi tạo âm thanh gốc.' });
            return null;
        }
        // 4. Process audio segments
        onProgress({ status: 'processing', progress: 20, detail: 'Đang xử lý âm thanh...' });
        const audioProcessor = new AudioProcessor_1.AudioProcessor(ffmpegPath, finalConfig.duckVolume);
        const audioResult = await audioProcessor.processAudioSegments(segments, fullAudioWav, tempDir, (pct) => {
            const progress = 20 + Math.round(pct * 0.3);
            onProgress({
                status: 'processing',
                progress,
                detail: `Đang xử lý âm thanh ${Math.round(pct)}%...`
            });
        });
        // 5. Validate segments based on ACTUAL audio durations
        onProgress({ status: 'rerendering', progress: 55, detail: 'Đang xác thực phân đoạn...' });
        const validator = new SegmentValidator_1.SegmentValidator();
        const validatedSegments = validator.validateAndAdjust(segments, audioResult.actualDurations, videoDuration);
        // SRT export with adjusted timeline (non-fatal)
        const exportLang = finalConfig.lang;
        if (exportLang || fs_1.default.existsSync(path_1.default.join(projectPath, 'translate'))) {
            try {
                const translatedPath = resolveTranslatedSrt(projectPath, exportLang);
                if (translatedPath) {
                    const content = fs_1.default.readFileSync(translatedPath, 'utf-8');
                    const outputDir = path_1.default.join(projectPath, 'final');
                    const langCode = path_1.default.basename(translatedPath, '.srt');
                    const outputPath = path_1.default.join(outputDir, `${langCode}.srt`);
                    const exporter = new SrtTimelineExporter_1.SrtTimelineExporter();
                    exporter.export(validatedSegments, content, outputPath);
                    console.log(`[FinalVideoService] Exported SRT: ${outputPath}`);
                }
            }
            catch (err) {
                console.warn('[FinalVideoService] SRT export failed (non-fatal):', err);
            }
        }
        // 6. Build video chunks (merge consecutive same-speed segments)
        onProgress({ status: 'rerendering', progress: 55, detail: 'Đang gộp phân đoạn video...' });
        const videoChunks = buildVideoChunks(validatedSegments);
        // 7. Process video chunks (copy fast, re-encode only speed-changed ones)
        onProgress({ status: 'rerendering', progress: 60, detail: 'Đang xử lý video bằng GPU...' });
        const videoProcessor = new VideoProcessor_1.VideoProcessor(encoderFactory, validator, {
            concurrency: 6,
            maxRetries: 3,
            retryDelay: 1000,
            encoderPreference: finalConfig.encoderPreference || 'gpu'
        });
        const isSourceH264 = videoMeta.codec === 'h264' || videoMeta.codec === 'avc1';
        console.log(`[FinalVideoService] Source codec: ${videoMeta.codec}, isH264: ${isSourceH264}`);
        const chunkVideoPaths = await videoProcessor.processVideoChunks(videoChunks, originalVideo, tempDir, (pct) => {
            const progress = 60 + Math.round(pct * 15);
            onProgress({
                status: 'rerendering',
                progress,
                detail: `Đang xử lý video ${Math.round(pct * 100)}%...`
            });
        }, !isSourceH264);
        console.log(`[FinalVideoService] Processed ${chunkVideoPaths.length} video chunks`);
        // 8. Concat video chunks
        onProgress({ status: 'rerendering', progress: 75, detail: 'Đang gộp video...' });
        const outputDir = path_1.default.join(projectPath, 'final');
        if (!fs_1.default.existsSync(outputDir))
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        const outputPath = path_1.default.join(outputDir, 'final_video.mp4');
        const tempVideoPath = path_1.default.join(tempDir, 'concated_video.mp4');
        try {
            console.log(`[FinalVideoService] Source is ${videoMeta.codec} → safe re-encode concat`);
            await videoProcessor.concatenateVideo(chunkVideoPaths, tempVideoPath, false);
        }
        catch (concatErr) {
            throw new Error(`Lỗi gộp video: ${concatErr.message}`);
        }
        // 9. Concat audio segments into one stream
        onProgress({ status: 'rerendering', progress: 85, detail: 'Đang gộp âm thanh...' });
        let finalAudioPath;
        try {
            finalAudioPath = await audioProcessor.concatenateAudio(audioResult.segmentPaths, tempDir);
        }
        catch (audioErr) {
            throw new Error(`Lỗi gộp âm thanh: ${audioErr.message}`);
        }
        // 10. Mux video + audio (1 final step instead of per-segment)
        onProgress({ status: 'rerendering', progress: 90, detail: 'Đang đồng bộ audio với video...' });
        try {
            await videoProcessor.muxWithAudio(tempVideoPath, finalAudioPath, outputPath);
        }
        catch (muxErr) {
            throw new Error(`Lỗi đồng bộ audio-video: ${muxErr.message}`);
        }
        // Cleanup - delay to allow Windows to release file locks
        await new Promise(resolve => setTimeout(resolve, 500));
        TempFileManager_1.tempManager.unregister(tempDir);
        try {
            await TempFileManager_1.tempManager.cleanup();
        }
        catch (cleanupErr) {
            console.warn('[FinalVideoService] Cleanup warning:', cleanupErr);
            // Don't fail the render if cleanup fails
        }
        const totalTime = Math.round((Date.now() - startTime) / 1000);
        onProgress({ status: 'done', progress: 100, detail: `Hoàn tất! Render mất ${totalTime}s.` });
        return outputPath;
    }
    catch (err) {
        const tempDir = path_1.default.join(projectPath, 'temp_final');
        TempFileManager_1.tempManager.unregister(tempDir);
        try {
            await TempFileManager_1.tempManager.cleanup();
        }
        catch (cleanupErr) {
            console.warn('[FinalVideoService] Error cleanup warning:', cleanupErr);
        }
        if (err.message === "Cancelled by user") {
            onProgress({ status: 'error', progress: 0, detail: `Đã huỷ xuất video!` });
            return null;
        }
        console.error('Create final video failed:', err);
        onProgress({ status: 'error', progress: 0, detail: `Lỗi System: ${err.message}` });
        return null;
    }
};
exports.createFinalVideo = createFinalVideo;
//# sourceMappingURL=FinalVideoService.js.map