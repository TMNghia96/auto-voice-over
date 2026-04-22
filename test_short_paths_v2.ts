import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

function getShortPath(longPath: string): string {
    const cmd = `(New-Object -ComObject Scripting.FileSystemObject).GetFile('${longPath.replace(/'/g, "''")}').ShortPath`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf-8' });
    return result.stdout.trim() || longPath;
}

function getShortPathFolder(longPath: string): string {
    const cmd = `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${longPath.replace(/'/g, "''")}').ShortPath`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf-8' });
    return result.stdout.trim() || longPath;
}

const binDir = path.join(process.cwd(), 'bin');
const whisperCpuDir = path.join(binDir, 'whisper-cpu');
const whisperCli = path.join(whisperCpuDir, 'whisper-cli.exe');
const ffmpegExe = path.join(binDir, 'ffmpeg', 'ffmpeg.exe');
const modelPath = path.join(binDir, 'models', 'ggml-base.bin');

const testWorkspace = path.join(process.cwd(), 'Test_Đạo_Lý_1');
if (!fs.existsSync(testWorkspace)) fs.mkdirSync(testWorkspace, { recursive: true });

async function runTest() {
    const wavPath = path.join(testWorkspace, 'input_16k.wav');
    
    console.log('--- Generating real 16kHz mono WAV ---');
    spawnSync(ffmpegExe, [
        '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono',
        '-t', '2',
        '-c:a', 'pcm_s16le',
        '-y',
        wavPath
    ]);
    
    if (!fs.existsSync(modelPath)) {
        console.log('Model tiny not found at', modelPath, '- cannot test whisper');
        return;
    }
    
    const shortModel = getShortPath(modelPath);
    const shortWav = getShortPath(wavPath);
    const shortOutBase = getShortPathFolder(testWorkspace) + '\\output';
    
    console.log('Short Model:', shortModel);
    console.log('Short WAV:', shortWav);
    
    const args = [
        '-m', shortModel,
        '-f', shortWav,
        '-osrt',
        '-of', shortOutBase
    ];
    
    console.log('Running whisper with short paths:', whisperCli, args.join(' '));
    const result = spawnSync(whisperCli, args, {
        cwd: whisperCpuDir,
        encoding: 'utf-8'
    });
    
    console.log('Status:', result.status);
    console.log('Output:', result.stdout || result.stderr);
    
    const srtFile = shortOutBase + '.srt';
    console.log('SRT exists?', fs.existsSync(srtFile));
}

runTest().catch(console.error);
