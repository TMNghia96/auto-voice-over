import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { spawn, spawnSync } from 'child_process';
import { getHardwareInfo } from './HardwareService';
import { getWindowsShortPath } from '../lib/PathUtils';

const isDev = !app.isPackaged;
const BIN_DIR = isDev
    ? path.join(process.cwd(), 'bin')
    : path.join(app.getPath('userData'), 'bin');

const MODELS_DIR = path.join(BIN_DIR, 'models');
const WHISPER_CPU_DIR = path.join(BIN_DIR, 'whisper-cpu');
const WHISPER_GPU_DIR = path.join(BIN_DIR, 'whisper-gpu');
const WHISPER_OPENBLAS_DIR = path.join(BIN_DIR, 'whisper-openblas');
const WHISPER_VULKAN_DIR_LEGACY = path.join(BIN_DIR, 'whisper-vulkan');
const YT_DLP_DIR = path.join(BIN_DIR, 'yt-dlp');
const FFMPEG_DIR = path.join(BIN_DIR, 'ffmpeg');
const HANDBRAKE_DIR = path.join(BIN_DIR, 'handbrake');

export const getYtDlpPath = () => path.join(YT_DLP_DIR, 'yt-dlp.exe');
export const getFfmpegPath = () => path.join(FFMPEG_DIR, 'ffmpeg.exe');
export const getHandBrakePath = () => path.join(HANDBRAKE_DIR, 'HandBrakeCLI.exe');
export const getFfprobePath = () => path.join(FFMPEG_DIR, 'ffprobe.exe');
const MODEL_CONFIG_PATH = path.join(MODELS_DIR, 'model-config.json');

export interface WhisperModelInfo {
    id: string;
    name: string;
    fileName: string;
    url: string;
    disk: string;
    mem: string;
    downloaded: boolean;
    active: boolean;
}

export const WHISPER_MODELS = [
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

const readModelConfig = (): { activeModel: string } => {
    try {
        if (fs.existsSync(MODEL_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(MODEL_CONFIG_PATH, 'utf-8'));
        }
    } catch (error) {
        console.warn('Failed to read model config, using default:', error);
    }
    return { activeModel: 'base' };
};

const writeModelConfig = (config: { activeModel: string }) => {
    ensureDir(MODELS_DIR);
    fs.writeFileSync(MODEL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
};

export const getActiveModelId = (): string => {
    return readModelConfig().activeModel;
};

export const setActiveModelId = (modelId: string): boolean => {
    const model = WHISPER_MODELS.find(m => m.id === modelId);
    if (!model) return false;
    const modelPath = path.join(MODELS_DIR, model.fileName);
    if (!fs.existsSync(modelPath)) return false;
    writeModelConfig({ activeModel: modelId });
    return true;
};

export const getWhisperModelPath = (): string => {
    const config = readModelConfig();
    const model = WHISPER_MODELS.find(m => m.id === config.activeModel);
    if (model) {
        const modelPath = path.join(MODELS_DIR, model.fileName);
        if (fs.existsSync(modelPath)) return modelPath;
    }
    return path.join(MODELS_DIR, 'ggml-base.bin');
};

export const listWhisperModels = (): WhisperModelInfo[] => {
    const config = readModelConfig();
    return WHISPER_MODELS.map(m => ({
        ...m,
        downloaded: fs.existsSync(path.join(MODELS_DIR, m.fileName)),
        active: m.id === config.activeModel,
    }));
};

const activeDownloadConfig: { modelId: string | null; percent: number } = {
    modelId: null,
    percent: 0,
};

export const getWhisperDownloadStatus = () => {
    return { modelId: activeDownloadConfig.modelId, percent: activeDownloadConfig.percent };
};

export const setWhisperDownloadStatus = (modelId: string | null, percent: number) => {
    activeDownloadConfig.modelId = modelId;
    activeDownloadConfig.percent = percent;
};

export const downloadWhisperModel = async (
    modelId: string,
    onProgress: (percent: number) => void,
): Promise<boolean> => {
    const model = WHISPER_MODELS.find(m => m.id === modelId);
    if (!model) return false;

    ensureDir(MODELS_DIR);
    const destPath = path.join(MODELS_DIR, model.fileName);

    if (fs.existsSync(destPath)) return true;

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
    } catch (err) {
        console.error(`Failed to download model ${modelId}:`, err);
        if (fs.existsSync(destPath)) {
            try {
                fs.unlinkSync(destPath);
            } catch (cleanupError) {
                console.warn(`Failed to remove partial model file for ${modelId}:`, cleanupError);
            }
        }
        activeDownloadConfig.modelId = null;
        activeDownloadConfig.percent = 0;
        return false;
    }
};

export const deleteWhisperModel = (modelId: string): boolean => {
    const downloadedCount = WHISPER_MODELS.filter(m =>
        fs.existsSync(path.join(MODELS_DIR, m.fileName))
    ).length;

    if (downloadedCount <= 1) return false;

    const model = WHISPER_MODELS.find(m => m.id === modelId);
    if (!model) return false;

    const modelPath = path.join(MODELS_DIR, model.fileName);
    if (!fs.existsSync(modelPath)) return false;

    const config = readModelConfig();
    if (config.activeModel === modelId) {
        const otherModel = WHISPER_MODELS.find(m =>
            m.id !== modelId && fs.existsSync(path.join(MODELS_DIR, m.fileName))
        );
        if (otherModel) {
            writeModelConfig({ activeModel: otherModel.id });
        } else {
            return false;
        }
    }

    try {
        fs.unlinkSync(modelPath);
        return true;
    } catch (err) {
        console.error(`Failed to delete model ${modelId}:`, err);
        return false;
    }
};

export const getWhisperPath = (engine: string = 'cpu') => {
    const variant = engine.includes('openblas') ? 'openblas' :
        engine.includes('gpu') ? 'gpu' : 'cpu';

    let result: string;
    if (variant === 'gpu') {
        result = path.join(WHISPER_GPU_DIR, 'whisper-cli.exe');
    } else if (variant === 'openblas') {
        result = path.join(WHISPER_OPENBLAS_DIR, 'whisper-cli.exe');
    } else {
        result = path.join(WHISPER_CPU_DIR, 'whisper-cli.exe');
    }

    console.log(`getWhisperPath(engine="${engine}") -> variant="${variant}", path="${result}"`);
    return result;
};

const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const FFMPEG_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const WHISPER_CPU_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip';
const WHISPER_GPU_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip';
const WHISPER_OPENBLAS_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-blas-bin-x64.zip';
const HANDBRAKE_URL = 'https://github.com/HandBrake/HandBrake/releases/download/1.10.2/HandBrakeCLI-1.10.2-win-x86_64.zip';

interface SetupProgress {
    status: string;
    progress: number;
    detail: string;
}

type ProgressCallback = (progress: SetupProgress) => void;

const ensureDir = (dir: string) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

/**
 * Download a file from URL with redirect support
 */
const downloadFile = (url: string, destPath: string, onProgress?: (percent: number) => void): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const makeRequest = (currentUrl: string, redirectCount = 0) => {
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

            https.get(options, (response) => {
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

                const fileStream = fs.createWriteStream(destPath);
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
                    fs.unlinkSync(destPath);
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
const extractExeFromZip = async (zipPath: string, destDir: string, exeName: string): Promise<boolean> => {
    return new Promise((resolve) => {
        try {
            const psCommand = `
                $exeName = '${exeName}';
                $zipPath = '${getWindowsShortPath(zipPath)}';
                $extractPath = '${getWindowsShortPath(destDir)}';
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

            const proc = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
                windowsHide: true
            });

            let output = '';
            proc.stdout.on('data', (data) => { output += data.toString(); });
            proc.stderr.on('data', (data) => { console.error('Extract stderr:', data.toString()); });

            proc.on('close', () => {
                if (fs.existsSync(zipPath)) {
                    fs.unlinkSync(zipPath);
                }
                resolve(output.includes('SUCCESS'));
            });

            proc.on('error', (err) => {
                console.error('Extract error:', err);
                resolve(false);
            });
        } catch (error) {
            console.error('Extract exception:', error);
            resolve(false);
        }
    });
};

/**
 * Check readiness
 */
export const isYtDlpReady = (): boolean => fs.existsSync(getYtDlpPath());
export const isFfmpegReady = (): boolean => fs.existsSync(getFfmpegPath());
export const isHandBrakeReady = (): boolean => fs.existsSync(getHandBrakePath());
export const isWhisperReady = (): boolean => fs.existsSync(getWhisperPath('cpu'));
export const isWhisperModelReady = (): boolean => {
    return WHISPER_MODELS.some(m => fs.existsSync(path.join(MODELS_DIR, m.fileName)));
};

export const isWhisperEngineReady = (engine: 'cpu' | 'gpu' | 'openblas'): boolean => {
    const exePath = getWhisperPath(engine);
    return fs.existsSync(exePath);
};

export const isEnvironmentReady = (): boolean => {
    // If running in Playwright test environment, avoid potential hangs in hardware checks
    if (process.env.PLAYWRIGHT_TEST === "true") {
        console.log('[isEnvironmentReady] Playwright test mode detected. Bypassing check.');
        return true;
    }

    const yt = isYtDlpReady();
    const ff = isFfmpegReady();
    const hb = isHandBrakeReady();
    const wcpu = isWhisperEngineReady('cpu');
    const wgpu = isWhisperEngineReady('gpu');
    const wopenblas = isWhisperEngineReady('openblas');
    const wmodel = isWhisperModelReady();
    
    console.log('[isEnvironmentReady] Diagnostics:', {
        yt, ff, hb, wcpu, wgpu, wopenblas, wmodel,
    });
    console.log('[isEnvironmentReady] BIN_DIR:', BIN_DIR);
    console.log('[isEnvironmentReady] isDev:', !app.isPackaged);

    const isReady = yt && ff && hb && wcpu && wgpu && wopenblas && wmodel;
    if (!isReady) {
        console.warn('[isEnvironmentReady] Environment NOT ready. Missing components.');
    }
    return isReady;
};

/**
 * Download a specific whisper engine variant on-demand
 */
export const downloadWhisperEngine = async (
    engine: 'cpu' | 'gpu' | 'openblas',
    onProgress: ProgressCallback
): Promise<boolean> => {
    if (isWhisperEngineReady(engine)) return true;

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
    const zipPath = path.join(destDir, 'whisper.zip');

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

/**
 * Cleanup legacy whisper-vulkan folder if it exists
 */
export const cleanupLegacyVulkanDir = (): void => {
    if (fs.existsSync(WHISPER_VULKAN_DIR_LEGACY)) {
        try {
            fs.rmSync(WHISPER_VULKAN_DIR_LEGACY, { recursive: true, force: true });
            console.log('[cleanup] Removed legacy whisper-vulkan directory.');
        } catch (err) {
            console.warn('[cleanup] Failed to remove legacy whisper-vulkan directory:', err);
        }
    }
};

/**
 * Setup the environment: download yt-dlp, ffmpeg, whisper.cpp (CPU + GPU), and whisper model if missing
 */
export const setupEnvironment = async (onProgress: ProgressCallback): Promise<boolean> => {
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
        cleanupLegacyVulkanDir();

        onProgress({ status: 'preparing', progress: 0, detail: 'Checking environment...' });
        console.log('[setupEnvironment] Starting setup. Current state:', {
            yt: isYtDlpReady(),
            ff: isFfmpegReady(),
            hb: isHandBrakeReady(),
            wcpu: isWhisperEngineReady('cpu'),
            wgpu: isWhisperEngineReady('gpu'),
            wopenblas: isWhisperEngineReady('openblas'),
            wmodel: isWhisperModelReady()
        });

        if (!isYtDlpReady()) {
            onProgress({ status: 'downloading', progress: 0, detail: 'Downloading yt-dlp.exe...' });
            const success = await downloadFile(YT_DLP_URL, getYtDlpPath(), (percent) => {
                onProgress({ status: 'downloading', progress: percent * 0.15, detail: `Downloading yt-dlp: ${percent}%` });
            });
            if (!success) return false;
            onProgress({ status: 'downloading', progress: 15, detail: 'yt-dlp download complete.' });
        } else {
            onProgress({ status: 'checking', progress: 15, detail: 'yt-dlp is ready.' });
        }

        if (!isFfmpegReady()) {
            onProgress({ status: 'downloading', progress: 15, detail: 'Downloading ffmpeg.exe...' });
            const zipPath = path.join(FFMPEG_DIR, 'ffmpeg.zip');
            const success = await downloadFile(FFMPEG_URL, zipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 15 + percent * 0.10, detail: `Downloading ffmpeg: ${percent}%` });
            });
            if (!success) return false;
            onProgress({ status: 'extracting', progress: 25, detail: 'Extracting ffmpeg...' });
            const extracted = await extractExeFromZip(zipPath, FFMPEG_DIR, 'ffmpeg.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 25, detail: 'Failed to extract ffmpeg!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 27, detail: 'ffmpeg is ready.' });
        } else {
            onProgress({ status: 'checking', progress: 27, detail: 'ffmpeg is ready.' });
        }

        if (!isHandBrakeReady()) {
            onProgress({ status: 'downloading', progress: 27, detail: 'Downloading HandBrakeCLI...' });
            const hbZipPath = path.join(HANDBRAKE_DIR, 'handbrake.zip');
            const success = await downloadFile(HANDBRAKE_URL, hbZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 27 + percent * 0.09, detail: `Downloading HandBrakeCLI: ${percent}%` });
            });
            if (!success) return false;
            onProgress({ status: 'extracting', progress: 36, detail: 'Extracting HandBrakeCLI...' });
            const extracted = await extractExeFromZip(hbZipPath, HANDBRAKE_DIR, 'HandBrakeCLI.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 36, detail: 'Failed to extract HandBrakeCLI!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 38, detail: 'HandBrakeCLI is ready.' });
        } else {
            onProgress({ status: 'checking', progress: 38, detail: 'HandBrakeCLI is ready.' });
        }

        if (!isWhisperEngineReady('cpu')) {
            onProgress({ status: 'downloading', progress: 38, detail: 'Downloading Whisper CPU...' });
            const whisperZipPath = path.join(WHISPER_CPU_DIR, 'whisper-cpu.zip');
            const success = await downloadFile(WHISPER_CPU_URL, whisperZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 38 + percent * 0.08, detail: `Downloading Whisper CPU: ${percent}%` });
            });
            if (!success) return false;
            onProgress({ status: 'extracting', progress: 46, detail: 'Extracting Whisper CPU...' });
            const extracted = await extractExeFromZip(whisperZipPath, WHISPER_CPU_DIR, 'whisper-cli.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 46, detail: 'Failed to extract Whisper CPU!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 48, detail: 'Whisper CPU is ready.' });
        } else {
            onProgress({ status: 'checking', progress: 48, detail: 'Whisper CPU is ready.' });
        }

        if (!isWhisperEngineReady('gpu')) {
            onProgress({ status: 'downloading', progress: 48, detail: 'Downloading Whisper GPU (CUDA)...' });
            const whisperGpuZipPath = path.join(WHISPER_GPU_DIR, 'whisper-gpu.zip');
            const success = await downloadFile(WHISPER_GPU_URL, whisperGpuZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 48 + percent * 0.08, detail: `Downloading Whisper GPU: ${percent}%` });
            });
            if (!success) return false;
            onProgress({ status: 'extracting', progress: 56, detail: 'Extracting Whisper GPU...' });
            const extracted = await extractExeFromZip(whisperGpuZipPath, WHISPER_GPU_DIR, 'whisper-cli.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 56, detail: 'Failed to extract Whisper GPU!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 56, detail: 'Whisper GPU is ready.' });
        } else {
            onProgress({ status: 'checking', progress: 56, detail: 'Whisper GPU is ready.' });
        }

        if (!isWhisperEngineReady('openblas')) {
            onProgress({ status: 'downloading', progress: 56, detail: 'Downloading Whisper OpenBLAS...' });
            const whisperBlasZipPath = path.join(WHISPER_OPENBLAS_DIR, 'whisper-openblas.zip');
            const success = await downloadFile(WHISPER_OPENBLAS_URL, whisperBlasZipPath, (percent) => {
                onProgress({ status: 'downloading', progress: 56 + percent * 0.04, detail: `Downloading Whisper OpenBLAS: ${percent}%` });
            });
            if (!success) return false;
            onProgress({ status: 'extracting', progress: 60, detail: 'Extracting Whisper OpenBLAS...' });
            const extracted = await extractExeFromZip(whisperBlasZipPath, WHISPER_OPENBLAS_DIR, 'whisper-cli.exe');
            if (!extracted) {
                onProgress({ status: 'error', progress: 60, detail: 'Failed to extract Whisper OpenBLAS!' });
                return false;
            }
            onProgress({ status: 'downloading', progress: 60, detail: 'Whisper OpenBLAS is ready.' });
        } else {
            onProgress({ status: 'checking', progress: 60, detail: 'Whisper OpenBLAS is ready.' });
        }

        if (!isWhisperModelReady()) {
            onProgress({ status: 'downloading', progress: 60, detail: 'Downloading Whisper base model...' });
            const baseModel = WHISPER_MODELS.find(m => m.id === 'base');
            if (!baseModel) {
                onProgress({ status: 'error', progress: 60, detail: 'Missing Whisper base model configuration!' });
                return false;
            }
            const baseModelPath = path.join(MODELS_DIR, baseModel.fileName);
            const success = await downloadFile(baseModel.url, baseModelPath, (percent) => {
                onProgress({ status: 'downloading', progress: 60 + percent * 0.35, detail: `Downloading Whisper model: ${percent}%` });
            });
            if (!success) return false;
            writeModelConfig({ activeModel: 'base' });
            onProgress({ status: 'downloading', progress: 95, detail: 'Whisper model download complete.' });
        } else {
            onProgress({ status: 'checking', progress: 95, detail: 'Whisper model is ready.' });
        }

        onProgress({ status: 'checking', progress: 98, detail: 'Checking system hardware...' });
        await getHardwareInfo();

        onProgress({ status: 'ready', progress: 100, detail: 'Environment setup complete.' });
        return true;

    } catch (error) {
        console.error('Environment setup failed:', error);
        onProgress({ status: 'error', progress: 0, detail: `Error: ${error}` });
        return false;
    }
};


