"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupEnvironment = exports.cleanupLegacyVulkanDir = exports.downloadWhisperEngine = exports.isEnvironmentReady = exports.isWhisperEngineReady = exports.isWhisperModelReady = exports.isWhisperReady = exports.isHandBrakeReady = exports.isFfmpegReady = exports.isYtDlpReady = exports.getWhisperPath = exports.deleteWhisperModel = exports.downloadWhisperModel = exports.setWhisperDownloadStatus = exports.getWhisperDownloadStatus = exports.listWhisperModels = exports.getWhisperModelPath = exports.setActiveModelId = exports.getActiveModelId = exports.WHISPER_MODELS = exports.getFfprobePath = exports.getHandBrakePath = exports.getFfmpegPath = exports.getYtDlpPath = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const child_process_1 = require("child_process");
const HardwareService_1 = require("./HardwareService");
const AppPaths_1 = require("./AppPaths");
const PathUtils_1 = require("../lib/PathUtils");
const isDev = !electron_1.app.isPackaged;
const BIN_DIR = isDev
    ? path_1.default.join(process.cwd(), 'bin')
    : path_1.default.join((0, AppPaths_1.getAppUserDataPath)(), 'bin');
const MODELS_DIR = path_1.default.join(BIN_DIR, 'models');
const WHISPER_CPU_DIR = path_1.default.join(BIN_DIR, 'whisper-cpu');
const WHISPER_GPU_DIR = path_1.default.join(BIN_DIR, 'whisper-gpu');
const WHISPER_OPENBLAS_DIR = path_1.default.join(BIN_DIR, 'whisper-openblas');
const WHISPER_VULKAN_DIR_LEGACY = path_1.default.join(BIN_DIR, 'whisper-vulkan');
const YT_DLP_DIR = path_1.default.join(BIN_DIR, 'yt-dlp');
const FFMPEG_DIR = path_1.default.join(BIN_DIR, 'ffmpeg');
const HANDBRAKE_DIR = path_1.default.join(BIN_DIR, 'handbrake');
const getYtDlpPath = () => path_1.default.join(YT_DLP_DIR, 'yt-dlp.exe');
exports.getYtDlpPath = getYtDlpPath;
const getFfmpegPath = () => path_1.default.join(FFMPEG_DIR, 'ffmpeg.exe');
exports.getFfmpegPath = getFfmpegPath;
const getHandBrakePath = () => path_1.default.join(HANDBRAKE_DIR, 'HandBrakeCLI.exe');
exports.getHandBrakePath = getHandBrakePath;
const getFfprobePath = () => path_1.default.join(FFMPEG_DIR, 'ffprobe.exe');
exports.getFfprobePath = getFfprobePath;
const MODEL_CONFIG_PATH = path_1.default.join(MODELS_DIR, 'model-config.json');
exports.WHISPER_MODELS = [
    {
        id: 'tiny',
        name: 'Tiny',
        fileName: 'ggml-tiny.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
        disk: '75 MiB',
        mem: '~273 MB',
    },
    {
        id: 'base',
        name: 'Base',
        fileName: 'ggml-base.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
        disk: '142 MiB',
        mem: '~388 MB',
    },
    {
        id: 'small',
        name: 'Small',
        fileName: 'ggml-small.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
        disk: '466 MiB',
        mem: '~852 MB',
    },
    {
        id: 'medium',
        name: 'Medium',
        fileName: 'ggml-medium.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
        disk: '1.5 GiB',
        mem: '~2.1 GB',
    },
    {
        id: 'large',
        name: 'Large',
        fileName: 'ggml-large-v3-turbo.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
        disk: '2.9 GiB',
        mem: '~3.9 GB',
    },
];
const readModelConfig = () => {
    try {
        if (fs_1.default.existsSync(MODEL_CONFIG_PATH)) {
            return JSON.parse(fs_1.default.readFileSync(MODEL_CONFIG_PATH, 'utf-8'));
        }
    }
    catch (error) {
        console.warn('Failed to read model config, using default:', error);
    }
    return { activeModel: 'base' };
};
const writeModelConfig = (config) => {
    ensureDir(MODELS_DIR);
    fs_1.default.writeFileSync(MODEL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
};
const getActiveModelId = () => {
    return readModelConfig().activeModel;
};
exports.getActiveModelId = getActiveModelId;
const setActiveModelId = (modelId) => {
    const model = exports.WHISPER_MODELS.find(m => m.id === modelId);
    if (!model)
        return false;
    const modelPath = path_1.default.join(MODELS_DIR, model.fileName);
    if (!fs_1.default.existsSync(modelPath))
        return false;
    writeModelConfig({ activeModel: modelId });
    return true;
};
exports.setActiveModelId = setActiveModelId;
const getWhisperModelPath = () => {
    const config = readModelConfig();
    const model = exports.WHISPER_MODELS.find(m => m.id === config.activeModel);
    if (model) {
        const modelPath = path_1.default.join(MODELS_DIR, model.fileName);
        if (fs_1.default.existsSync(modelPath))
            return modelPath;
    }
    return path_1.default.join(MODELS_DIR, 'ggml-base.bin');
};
exports.getWhisperModelPath = getWhisperModelPath;
const listWhisperModels = () => {
    const config = readModelConfig();
    return exports.WHISPER_MODELS.map(m => ({
        ...m,
        downloaded: fs_1.default.existsSync(path_1.default.join(MODELS_DIR, m.fileName)),
        active: m.id === config.activeModel,
    }));
};
exports.listWhisperModels = listWhisperModels;
const activeDownloadConfig = {
    modelId: null,
    percent: 0,
};
const getWhisperDownloadStatus = () => {
    return { modelId: activeDownloadConfig.modelId, percent: activeDownloadConfig.percent };
};
exports.getWhisperDownloadStatus = getWhisperDownloadStatus;
const setWhisperDownloadStatus = (modelId, percent) => {
    activeDownloadConfig.modelId = modelId;
    activeDownloadConfig.percent = percent;
};
exports.setWhisperDownloadStatus = setWhisperDownloadStatus;
const downloadWhisperModel = async (modelId, onProgress) => {
    const model = exports.WHISPER_MODELS.find(m => m.id === modelId);
    if (!model)
        return false;
    ensureDir(MODELS_DIR);
    const destPath = path_1.default.join(MODELS_DIR, model.fileName);
    if (fs_1.default.existsSync(destPath))
        return true;
    activeDownloadConfig.modelId = modelId;
    activeDownloadConfig.percent = 0;
    try {
        await downloadFile(model.url, destPath, (percent) => {
            activeDownloadConfig.percent = percent;
            onProgress(percent);
        });
        activeDownloadConfig.modelId = null;
        activeDownloadConfig.percent = 0;
        return true;
    }
    catch (err) {
        console.error(`Failed to download model ${modelId}:`, err);
        if (fs_1.default.existsSync(destPath)) {
            try {
                fs_1.default.unlinkSync(destPath);
            }
            catch (cleanupError) {
                console.warn(`Failed to remove partial model file for ${modelId}:`, cleanupError);
            }
        }
        activeDownloadConfig.modelId = null;
        activeDownloadConfig.percent = 0;
        return false;
    }
};
exports.downloadWhisperModel = downloadWhisperModel;
const deleteWhisperModel = (modelId) => {
    const downloadedCount = exports.WHISPER_MODELS.filter(m => fs_1.default.existsSync(path_1.default.join(MODELS_DIR, m.fileName))).length;
    if (downloadedCount <= 1)
        return false;
    const model = exports.WHISPER_MODELS.find(m => m.id === modelId);
    if (!model)
        return false;
    const modelPath = path_1.default.join(MODELS_DIR, model.fileName);
    if (!fs_1.default.existsSync(modelPath))
        return false;
    const config = readModelConfig();
    if (config.activeModel === modelId) {
        const otherModel = exports.WHISPER_MODELS.find(m => m.id !== modelId && fs_1.default.existsSync(path_1.default.join(MODELS_DIR, m.fileName)));
        if (otherModel) {
            writeModelConfig({ activeModel: otherModel.id });
        }
        else {
            return false;
        }
    }
    try {
        fs_1.default.unlinkSync(modelPath);
        return true;
    }
    catch (err) {
        console.error(`Failed to delete model ${modelId}:`, err);
        return false;
    }
};
exports.deleteWhisperModel = deleteWhisperModel;
const getWhisperPath = (engine = 'cpu') => {
    const variant = engine.includes('openblas') ? 'openblas' :
        engine.includes('gpu') ? 'gpu' : 'cpu';
    let result;
    if (variant === 'gpu') {
        result = path_1.default.join(WHISPER_GPU_DIR, 'whisper-cli.exe');
    }
    else if (variant === 'openblas') {
        result = path_1.default.join(WHISPER_OPENBLAS_DIR, 'whisper-cli.exe');
    }
    else {
        result = path_1.default.join(WHISPER_CPU_DIR, 'whisper-cli.exe');
    }
    console.log(`getWhisperPath(engine="${engine}") -> variant="${variant}", path="${result}"`);
    return result;
};
exports.getWhisperPath = getWhisperPath;
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const FFMPEG_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const WHISPER_CPU_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip';
const WHISPER_GPU_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip';
const WHISPER_OPENBLAS_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-blas-bin-x64.zip';
const HANDBRAKE_URL = 'https://github.com/HandBrake/HandBrake/releases/download/1.10.2/HandBrakeCLI-1.10.2-win-x86_64.zip';
const ensureDir = (dir) => {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
};
/**
 * Download a file from URL with redirect support
 */
const downloadFile = (url, destPath, onProgress) => {
    return new Promise((resolve, reject) => {
        const makeRequest = (currentUrl, redirectCount = 0) => {
            if (redirectCount > 10) {
                reject(new Error('Too many redirects'));
                return;
            }
            const parsedUrl = new URL(currentUrl);
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            https_1.default.get(options, (response) => {
                if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    makeRequest(response.headers.location, redirectCount + 1);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed with status code: ${response.statusCode}`));
                    return;
                }
                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedSize = 0;
                const fileStream = fs_1.default.createWriteStream(destPath);
                response.pipe(fileStream);
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (totalSize > 0 && onProgress) {
                        onProgress(Math.round((downloadedSize / totalSize) * 100));
                    }
                });
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(true);
                });
                fileStream.on('error', (err) => {
                    fs_1.default.unlinkSync(destPath);
                    reject(err);
                });
            }).on('error', (err) => {
                reject(err);
            });
        };
        makeRequest(url);
    });
};
/**
 * Extract a specific exe from a downloaded zip using PowerShell
 */
const extractExeFromZip = async (zipPath, destDir, exeName) => {
    return new Promise((resolve) => {
        try {
            const psCommand = `
                $exeName = '${exeName}';
                $zipPath = '${(0, PathUtils_1.getWindowsShortPath)(zipPath)}';
                $extractPath = '${(0, PathUtils_1.getWindowsShortPath)(destDir)}';
                $tempExtract = Join-Path $extractPath '${exeName}_temp';
                
                # Try to kill any running instances first
                $running = Get-Process -Name $exeName.Replace(".exe", "") -ErrorAction SilentlyContinue;
                if ($running) { 
                    $running | Stop-Process -Force;
                    Start-Sleep -Seconds 1;
                }

                if (Test-Path $tempExtract) { 
                    try { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue } catch {}
                }
                
                Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force;
                
                $targetExe = Get-ChildItem -Path $tempExtract -Recurse -Filter $exeName | Select-Object -First 1;
                
                if ($targetExe) {
                    Copy-Item $targetExe.FullName (Join-Path $extractPath $exeName) -Force;
                    # Also copy any DLLs that might be needed
                    $dllFiles = Get-ChildItem -Path $targetExe.DirectoryName -Filter "*.dll" -ErrorAction SilentlyContinue;
                    foreach ($dll in $dllFiles) {
                        Copy-Item $dll.FullName (Join-Path $extractPath $dll.Name) -Force;
                    }
                    # Also copy sibling .exe files (e.g. ffprobe.exe alongside ffmpeg.exe)
                    $siblingExes = Get-ChildItem -Path $targetExe.DirectoryName -Filter "*.exe" -ErrorAction SilentlyContinue;
                    foreach ($exe in $siblingExes) {
                        if ($exe.Name -ne $exeName) {
                            Copy-Item $exe.FullName (Join-Path $extractPath $exe.Name) -Force;
                        }
                    }
                    try { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue } catch {}
                    Write-Output "SUCCESS";
                } else {
                    try { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue } catch {}
                    Write-Output "NOTFOUND";
                }
            `;
            const proc = (0, child_process_1.spawn)('powershell.exe', ['-NoProfile', '-Command', psCommand], {
                windowsHide: true
            });
            let output = '';
            proc.stdout.on('data', (data) => { output += data.toString(); });
            proc.stderr.on('data', (data) => { console.error('Extract stderr:', data.toString()); });
            proc.on('close', () => {
                if (fs_1.default.existsSync(zipPath)) {
                    fs_1.default.unlinkSync(zipPath);
                }
                resolve(output.includes('SUCCESS'));
            });
            proc.on('error', (err) => {
                console.error('Extract error:', err);
                resolve(false);
            });
        }
        catch (error) {
            console.error('Extract exception:', error);
            resolve(false);
        }
    });
};
/**
 * Check readiness
 */
const isYtDlpReady = () => fs_1.default.existsSync((0, exports.getYtDlpPath)());
exports.isYtDlpReady = isYtDlpReady;
const isFfmpegReady = () => fs_1.default.existsSync((0, exports.getFfmpegPath)());
exports.isFfmpegReady = isFfmpegReady;
const isHandBrakeReady = () => fs_1.default.existsSync((0, exports.getHandBrakePath)());
exports.isHandBrakeReady = isHandBrakeReady;
const isWhisperReady = () => fs_1.default.existsSync((0, exports.getWhisperPath)('cpu'));
exports.isWhisperReady = isWhisperReady;
const isWhisperModelReady = () => {
    return exports.WHISPER_MODELS.some(m => fs_1.default.existsSync(path_1.default.join(MODELS_DIR, m.fileName)));
};
exports.isWhisperModelReady = isWhisperModelReady;
const isWhisperEngineReady = (engine) => {
    const exePath = (0, exports.getWhisperPath)(engine);
    return fs_1.default.existsSync(exePath);
};
exports.isWhisperEngineReady = isWhisperEngineReady;
const isEnvironmentReady = () => {
    // If running in Playwright test environment, avoid potential hangs in hardware checks
    if (process.env.PLAYWRIGHT_TEST === "true") {
        console.log('[isEnvironmentReady] Playwright test mode detected. Bypassing check.');
        return true;
    }
    const yt = (0, exports.isYtDlpReady)();
    const ff = (0, exports.isFfmpegReady)();
    const hb = (0, exports.isHandBrakeReady)();
    const wcpu = (0, exports.isWhisperEngineReady)('cpu');
    const wgpu = (0, exports.isWhisperEngineReady)('gpu');
    const wopenblas = (0, exports.isWhisperEngineReady)('openblas');
    const wmodel = (0, exports.isWhisperModelReady)();
    console.log('[isEnvironmentReady] Diagnostics:', {
        yt, ff, hb, wcpu, wgpu, wopenblas, wmodel,
    });
    console.log('[isEnvironmentReady] BIN_DIR:', BIN_DIR);
    console.log('[isEnvironmentReady] isDev:', !electron_1.app.isPackaged);
    const isReady = yt && ff && hb && wcpu && wgpu && wopenblas && wmodel;
    if (!isReady) {
        console.warn('[isEnvironmentReady] Environment NOT ready. Missing components.');
    }
    return isReady;
};
exports.isEnvironmentReady = isEnvironmentReady;
/**
 * Download a specific whisper engine variant on-demand
 */
const downloadWhisperEngine = async (engine, onProgress) => {
    if ((0, exports.isWhisperEngineReady)(engine))
        return true;
    const url = engine === 'gpu' ? WHISPER_GPU_URL
        : engine === 'openblas' ? WHISPER_OPENBLAS_URL
            : WHISPER_CPU_URL;
    const destDir = engine === 'gpu' ? WHISPER_GPU_DIR
        : engine === 'openblas' ? WHISPER_OPENBLAS_DIR
            : WHISPER_CPU_DIR;
    const label = engine === 'gpu' ? 'Whisper GPU (CUDA)'
        : engine === 'openblas' ? 'Whisper OpenBLAS (CPU Accelerated)'
            : 'Whisper CPU';
    ensureDir(destDir);
    onProgress({ status: 'downloading', progress: 0, detail: `Đang tải ${label}...` });
    const zipPath = path_1.default.join(destDir, 'whisper.zip');
    await downloadFile(url, zipPath, (percent) => {
        onProgress({ status: 'downloading', progress: percent * 0.8, detail: `Đang tải ${label}... ${percent}%` });
    });
    onProgress({ status: 'extracting', progress: 80, detail: `Đang giải nén ${label}...` });
    const extracted = await extractExeFromZip(zipPath, destDir, 'whisper-cli.exe');
    if (!extracted) {
        onProgress({ status: 'error', progress: 0, detail: `Không thể giải nén ${label}!` });
        return false;
    }
    onProgress({ status: 'ready', progress: 100, detail: `${label} đã sẵn sàng!` });
    return true;
};
exports.downloadWhisperEngine = downloadWhisperEngine;
/**
 * Cleanup legacy whisper-vulkan folder if it exists
 */
const cleanupLegacyVulkanDir = () => {
    if (fs_1.default.existsSync(WHISPER_VULKAN_DIR_LEGACY)) {
        try {
            fs_1.default.rmSync(WHISPER_VULKAN_DIR_LEGACY, { recursive: true, force: true });
            console.log('[cleanup] Removed legacy whisper-vulkan directory.');
        }
        catch (err) {
            console.warn('[cleanup] Failed to remove legacy whisper-vulkan directory:', err);
        }
    }
};
exports.cleanupLegacyVulkanDir = cleanupLegacyVulkanDir;
/**
 * Setup the environment: download yt-dlp, ffmpeg, whisper.cpp (CPU + GPU), and whisper model if missing
 */
const setupEnvironment = async (onProgress) => {
    try {
        ensureDir(BIN_DIR);
        ensureDir(MODELS_DIR);
        ensureDir(YT_DLP_DIR);
        ensureDir(FFMPEG_DIR);
        ensureDir(HANDBRAKE_DIR);
        ensureDir(WHISPER_CPU_DIR);
        ensureDir(WHISPER_GPU_DIR);
        ensureDir(WHISPER_OPENBLAS_DIR);
        // Cleanup legacy whisper-vulkan folder
        (0, exports.cleanupLegacyVulkanDir)();
        onProgress({ status: 'preparing', progress: 0, detail: 'Checking environment...' });
        console.log('[setupEnvironment] Starting setup. Current state:', {
            yt: (0, exports.isYtDlpReady)(),
            ff: (0, exports.isFfmpegReady)(),
            hb: (0, exports.isHandBrakeReady)(),
            wcpu: (0, exports.isWhisperEngineReady)('cpu'),
            wgpu: (0, exports.isWhisperEngineReady)('gpu'),
            wopenblas: (0, exports.isWhisperEngineReady)('openblas'),
            wmodel: (0, exports.isWhisperModelReady)()
        });
        if (!(0, exports.isYtDlpReady)()) {
            onProgress({ status: 'downloading', progress: 0, detail: 'Downloading yt-dlp.exe...' });
            const success = await downloadFile(YT_DLP_URL, (0, exports.getYtDlpPath)(), (percent) => {
                onProgress({ status: 'downloading', progress: percent * 0.15, detail: `Downloading yt-dlp: ${percent}%` });
            });
            if (!success)
                return false;
            onProgress({ status: 'downloading', progress: 15, detail: 'yt-dlp download complete.' });
        }
        else {
            onProgress({ status: 'checking', progress: 15, detail: 'yt-dlp is ready.' });
        }
        if (!(0, exports.isFfmpegReady)()) {
            onProgress({ status: 'downloading', progress: 15, detail: 'Downloading ffmpeg.exe...' });
            const zipPath = path_1.default.join(FFMPEG_DIR, 'ffmpeg.zip');
            const success = await downloadFile(FFMPEG_URL, zipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 15 + percent * 0.10, detail: `Downloading ffmpeg: ${percent}%` });
            });
            if (!success)
                return false;
            onProgress({ status: 'extracting', progress: 25, detail: 'Extracting ffmpeg...' });
            const extracted = await extractExeFromZip(zipPath, FFMPEG_DIR, 'ffmpeg.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 25, detail: 'Failed to extract ffmpeg!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 27, detail: 'ffmpeg is ready.' });
        }
        else {
            onProgress({ status: 'checking', progress: 27, detail: 'ffmpeg is ready.' });
        }
        if (!(0, exports.isHandBrakeReady)()) {
            onProgress({ status: 'downloading', progress: 27, detail: 'Downloading HandBrakeCLI...' });
            const hbZipPath = path_1.default.join(HANDBRAKE_DIR, 'handbrake.zip');
            const success = await downloadFile(HANDBRAKE_URL, hbZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 27 + percent * 0.09, detail: `Downloading HandBrakeCLI: ${percent}%` });
            });
            if (!success)
                return false;
            onProgress({ status: 'extracting', progress: 36, detail: 'Extracting HandBrakeCLI...' });
            const extracted = await extractExeFromZip(hbZipPath, HANDBRAKE_DIR, 'HandBrakeCLI.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 36, detail: 'Failed to extract HandBrakeCLI!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 38, detail: 'HandBrakeCLI is ready.' });
        }
        else {
            onProgress({ status: 'checking', progress: 38, detail: 'HandBrakeCLI is ready.' });
        }
        if (!(0, exports.isWhisperEngineReady)('cpu')) {
            onProgress({ status: 'downloading', progress: 38, detail: 'Downloading Whisper CPU...' });
            const whisperZipPath = path_1.default.join(WHISPER_CPU_DIR, 'whisper-cpu.zip');
            const success = await downloadFile(WHISPER_CPU_URL, whisperZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 38 + percent * 0.08, detail: `Downloading Whisper CPU: ${percent}%` });
            });
            if (!success)
                return false;
            onProgress({ status: 'extracting', progress: 46, detail: 'Extracting Whisper CPU...' });
            const extracted = await extractExeFromZip(whisperZipPath, WHISPER_CPU_DIR, 'whisper-cli.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 46, detail: 'Failed to extract Whisper CPU!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 48, detail: 'Whisper CPU is ready.' });
        }
        else {
            onProgress({ status: 'checking', progress: 48, detail: 'Whisper CPU is ready.' });
        }
        if (!(0, exports.isWhisperEngineReady)('gpu')) {
            onProgress({ status: 'downloading', progress: 48, detail: 'Downloading Whisper GPU (CUDA)...' });
            const whisperGpuZipPath = path_1.default.join(WHISPER_GPU_DIR, 'whisper-gpu.zip');
            const success = await downloadFile(WHISPER_GPU_URL, whisperGpuZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 48 + percent * 0.08, detail: `Downloading Whisper GPU: ${percent}%` });
            });
            if (!success)
                return false;
            onProgress({ status: 'extracting', progress: 56, detail: 'Extracting Whisper GPU...' });
            const extracted = await extractExeFromZip(whisperGpuZipPath, WHISPER_GPU_DIR, 'whisper-cli.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 56, detail: 'Failed to extract Whisper GPU!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 56, detail: 'Whisper GPU is ready.' });
        }
        else {
            onProgress({ status: 'checking', progress: 56, detail: 'Whisper GPU is ready.' });
        }
        if (!(0, exports.isWhisperEngineReady)('openblas')) {
            onProgress({ status: 'downloading', progress: 56, detail: 'Downloading Whisper OpenBLAS...' });
            const whisperBlasZipPath = path_1.default.join(WHISPER_OPENBLAS_DIR, 'whisper-openblas.zip');
            const success = await downloadFile(WHISPER_OPENBLAS_URL, whisperBlasZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 56 + percent * 0.04, detail: `Downloading Whisper OpenBLAS: ${percent}%` });
            });
            if (!success)
                return false;
            onProgress({ status: 'extracting', progress: 60, detail: 'Extracting Whisper OpenBLAS...' });
            const extracted = await extractExeFromZip(whisperBlasZipPath, WHISPER_OPENBLAS_DIR, 'whisper-cli.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 60, detail: 'Failed to extract Whisper OpenBLAS!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 60, detail: 'Whisper OpenBLAS is ready.' });
        }
        else {
            onProgress({ status: 'checking', progress: 60, detail: 'Whisper OpenBLAS is ready.' });
        }
        if (!(0, exports.isWhisperModelReady)()) {
            onProgress({ status: 'downloading', progress: 60, detail: 'Downloading Whisper base model...' });
            const baseModel = exports.WHISPER_MODELS.find(m => m.id === 'base');
            if (!baseModel) {
                onProgress({ status: 'error', progress: 60, detail: 'Missing Whisper base model configuration!' });
                return false;
            }
            const baseModelPath = path_1.default.join(MODELS_DIR, baseModel.fileName);
            const success = await downloadFile(baseModel.url, baseModelPath, (percent) => {
                onProgress({ status: 'downloading', progress: 60 + percent * 0.35, detail: `Downloading Whisper model: ${percent}%` });
            });
            if (!success)
                return false;
            writeModelConfig({ activeModel: 'base' });
            onProgress({ status: 'downloading', progress: 95, detail: 'Whisper model download complete.' });
        }
        else {
            onProgress({ status: 'checking', progress: 95, detail: 'Whisper model is ready.' });
        }
        onProgress({ status: 'checking', progress: 98, detail: 'Checking system hardware...' });
        await (0, HardwareService_1.getHardwareInfo)();
        onProgress({ status: 'ready', progress: 100, detail: 'Environment setup complete.' });
        return true;
    }
    catch (error) {
        console.error('Environment setup failed:', error);
        onProgress({ status: 'error', progress: 0, detail: `Error: ${error}` });
        return false;
    }
};
exports.setupEnvironment = setupEnvironment;
//# sourceMappingURL=EnvironmentService.js.map