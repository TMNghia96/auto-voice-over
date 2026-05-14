"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExistingSrt = exports.transcribeAudio = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ConfigService_1 = require("./ConfigService");
const EnvironmentService_1 = require("./EnvironmentService");
const SrtOptimizer_1 = require("../lib/SrtOptimizer");
const PathUtils_1 = require("../lib/PathUtils");
/**
 * Convert audio file (mp3/m4a/etc.) to 16kHz mono WAV using ffmpeg
 * whisper.cpp requires WAV 16kHz mono input
 */
const convertToWav = (inputPath, outputPath, ffmpegPath) => {
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)(ffmpegPath, [
            '-i', inputPath,
            '-ar', '16000', // 16kHz sample rate
            '-ac', '1', // mono
            '-c:a', 'pcm_s16le', // 16-bit PCM
            '-y', // overwrite
            outputPath
        ]);
        proc.stderr.on('data', (data) => {
            console.log('[ffmpeg convert]', data.toString());
        });
        proc.on('close', (code) => {
            resolve(code === 0);
        });
        proc.on('error', (err) => {
            console.error('ffmpeg convert error:', err);
            resolve(false);
        });
    });
};
const runWhisperX = (wavPath, outputDir, onProgress, engine = 'cpu', language = 'auto', hfToken = null) => {
    return new Promise((resolve) => {
        const modelId = (0, EnvironmentService_1.getActiveModelId)() || 'base';
        const args = [
            '-m', 'whisperx', // Execute Python module directly
            (0, PathUtils_1.getWindowsShortPath)(wavPath),
            '--model', modelId,
            '--output_dir', (0, PathUtils_1.getWindowsShortPath)(outputDir),
            '--output_format', 'srt',
            '--compute_type', 'int8', // Standard optimization for VRAM
        ];
        if (language && language !== 'auto') {
            args.push('--language', language);
        }
        if (hfToken && hfToken.trim().length > 0) {
            args.push('--hf_token', hfToken.trim());
        }
        // CPU vs GPU logic
        const engineStr = String(engine).toLowerCase();
        console.log(`[WhisperX Debug] Received engine variant: "${engineStr}"`);
        // Nếu chọn GPU nhưng máy là AMD (không có CUDA), người dùng nên chọn CPU.
        // Ở đây ta ép 'cpu' nếu chuỗi chứa 'cpu' hoặc 'openblas'.
        const device = (engineStr.includes('cpu') || engineStr.includes('openblas')) ? 'cpu' : 'cuda';
        args.push('--device', device);
        console.log(`[WhisperX Info] Selected device: ${device.toUpperCase()}`);
        console.log('Running python with args:', args.join(' '));
        const proc = (0, child_process_1.spawn)('python', args, {
            shell: process.platform === 'win32', // Use shell to resolve global path better on Windows
        });
        let stderrOutput = '';
        let lastProgress = 0;
        proc.stderr.on('data', (data) => {
            const text = data.toString();
            stderrOutput += text;
            console.log('[whisperx stderr]', text);
            // whisperx outputs typical tqdm progress bar: 30%|███       | 3/10 [00:01<00:02, 2.50it/s]
            const progressMatch = text.match(/(\d+)%/);
            if (progressMatch) {
                const pct = parseInt(progressMatch[1], 10);
                if (pct > lastProgress) {
                    lastProgress = pct;
                    onProgress({
                        status: 'transcribing',
                        progress: 30 + pct * 0.7, // map 0-100 to 30-100 overall
                        detail: `Transcribing voice (WhisperX)... ${pct}%`
                    });
                }
            }
        });
        proc.stdout.on('data', (data) => {
            const text = data.toString();
            console.log('[whisperx stdout]', text);
        });
        proc.on('close', (code) => {
            console.log('WhisperX finished, exit code:', code);
            // WhisperX outputs the file with the same name as the input audio + .srt
            const baseName = path_1.default.basename(wavPath, path_1.default.extname(wavPath));
            const srtPath = path_1.default.join(outputDir, baseName + '.srt');
            // Handle potential Short Path filename (e.g. AUDIO_~1.srt)
            const shortBaseName = path_1.default.basename((0, PathUtils_1.getWindowsShortPath)(wavPath), path_1.default.extname((0, PathUtils_1.getWindowsShortPath)(wavPath)));
            const shortSrtPath = path_1.default.join(outputDir, shortBaseName + '.srt');
            if (code === 0) {
                let finalSrtPath = null;
                if (fs_1.default.existsSync(srtPath)) {
                    finalSrtPath = srtPath;
                }
                else if (fs_1.default.existsSync(shortSrtPath)) {
                    console.log(`[WhisperX Info] Found SRT with short name: ${shortBaseName}.srt. Renaming to ${baseName}.srt...`);
                    try {
                        fs_1.default.renameSync(shortSrtPath, srtPath);
                        finalSrtPath = srtPath;
                    }
                    catch (err) {
                        console.error('Failed to rename short path SRT:', err);
                        finalSrtPath = shortSrtPath; // Fallback to use the short path one anyway
                    }
                }
                if (finalSrtPath) {
                    resolve(finalSrtPath);
                    return;
                }
            }
            // If we reach here, it failed or the file is missing
            let errorMessage = `WhisperX failed (Exit code: ${code}).`;
            if (code === 0 && !fs_1.default.existsSync(srtPath)) {
                errorMessage = `WhisperX finished but output file was not found! Expected: ${baseName}.srt`;
            }
            else if (code === 1 || stderrOutput.includes('not recognized') || stderrOutput.includes('not found')) {
                errorMessage = 'WhisperX is not installed. Please install Python and run: pip install whisperx';
            }
            else if (stderrOutput.includes('Unauthorized') || stderrOutput.includes('token')) {
                errorMessage = 'Hugging Face Token is invalid or missing permissions for pyannote/segmentation-3.0.';
            }
            else if (stderrOutput.includes('CUDA out of memory') || stderrOutput.includes('OutOfMemory')) {
                errorMessage = 'GPU Out of Memory. Try switching the Engine to CPU in settings.';
            }
            console.error('WhisperX failed.', errorMessage, 'Stderr:', stderrOutput);
            onProgress({ status: 'error', progress: 0, detail: errorMessage });
            resolve(null);
        });
        proc.on('error', (err) => {
            console.error('WhisperX spawn error:', err);
            onProgress({ status: 'error', progress: 0, detail: `Could not start WhisperX. Make sure Python and WhisperX are installed via pip. Error: ${err.message}` });
            resolve(null);
        });
    });
};
/**
 * Find the audio file in the project's original/audio directory
 */
const findAudioFile = (projectPath) => {
    const audioDir = path_1.default.join(projectPath, 'original', 'audio');
    if (!fs_1.default.existsSync(audioDir))
        return null;
    const files = fs_1.default.readdirSync(audioDir);
    const audioFile = files.find(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.wav') ||
        f.endsWith('.opus') || f.endsWith('.ogg') || f.endsWith('.webm'));
    if (audioFile) {
        return path_1.default.join(audioDir, audioFile);
    }
    return null;
};
/**
 * Main transcription function:
 * 1. Check and download whisper engine if needed
 * 2. Find audio file in project
 * 3. Convert to WAV (16kHz mono)
 * 4. Run whisper.cpp to generate SRT
 * 5. Return SRT content
 */
const transcribeAudio = async (projectPath, onProgress, engine = 'whisper-openblas', language = 'auto') => {
    try {
        console.log(`Transcript engine requested: ${engine}, using WhisperX via Python`);
        onProgress({ status: 'preparing', progress: 10, detail: 'Checking WhisperX environment...' });
        // NOTE: We assume whisperx is installed globally via pip.
        // We will catch execution errors if it's missing during the actual processing step.
        onProgress({ status: 'preparing', progress: 15, detail: 'Finding audio file...' });
        const audioFile = findAudioFile(projectPath);
        if (!audioFile) {
            onProgress({ status: 'error', progress: 0, detail: 'Audio file not found in project!' });
            return null;
        }
        console.log('Found audio file:', audioFile);
        onProgress({ status: 'preparing', progress: 18, detail: `Found: ${path_1.default.basename(audioFile)}` });
        const transcriptDir = path_1.default.join(projectPath, 'transcript');
        if (!fs_1.default.existsSync(transcriptDir)) {
            fs_1.default.mkdirSync(transcriptDir, { recursive: true });
        }
        const wavPath = path_1.default.join(transcriptDir, 'audio_16k.wav');
        if (!fs_1.default.existsSync(wavPath)) {
            onProgress({ status: 'converting', progress: 20, detail: 'Converting audio to WAV...' });
            const ffmpegPath = (0, EnvironmentService_1.getFfmpegPath)();
            const converted = await convertToWav(audioFile, wavPath, ffmpegPath);
            if (!converted) {
                onProgress({ status: 'error', progress: 20, detail: 'Audio conversion failed!' });
                return null;
            }
        }
        onProgress({ status: 'converting', progress: 30, detail: 'Audio conversion complete!' });
        onProgress({ status: 'transcribing', progress: 30, detail: 'Starting voice recognition...' });
        console.log(`Starting WhisperX transcription with variant: ${engine}`);
        // Base name output logic inside runWhisperX handles the .srt suffix automatically from outputDir
        const hfToken = (0, ConfigService_1.getApiKey)("huggingface");
        const srtPath = await runWhisperX(wavPath, transcriptDir, onProgress, engine, language, hfToken);
        if (!srtPath) {
            onProgress({ status: 'error', progress: 0, detail: 'Voice recognition failed!' });
            return null;
        }
        onProgress({ status: 'transcribing', progress: 95, detail: 'Optimizing subtitles...' });
        const srtContent = (0, SrtOptimizer_1.optimizeSrtFile)(srtPath);
        console.log('SRT optimized:', srtPath);
        onProgress({ status: 'done', progress: 100, detail: 'Voice recognition complete!' });
        return { srtPath, srtContent };
    }
    catch (error) {
        console.error('Transcription failed:', error);
        onProgress({ status: 'error', progress: 0, detail: `Error: ${error}` });
        return null;
    }
};
exports.transcribeAudio = transcribeAudio;
/**
 * Read existing SRT file if already transcribed
 */
const getExistingSrt = (projectPath) => {
    const transcriptDir = path_1.default.join(projectPath, 'transcript');
    if (!fs_1.default.existsSync(transcriptDir))
        return null;
    const files = fs_1.default.readdirSync(transcriptDir);
    const srtFile = files.find(f => f.endsWith('.srt'));
    if (srtFile) {
        const srtPath = path_1.default.join(transcriptDir, srtFile);
        const srtContent = fs_1.default.readFileSync(srtPath, 'utf-8');
        return { srtPath, srtContent };
    }
    return null;
};
exports.getExistingSrt = getExistingSrt;
//# sourceMappingURL=TranscriptService.js.map