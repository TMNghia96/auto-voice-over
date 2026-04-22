import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

function getShortPath(longPath: string): string {
    const cmd = `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${longPath.replace(/'/g, "''")}').ShortPath`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf-8' });
    return result.stdout.trim() || longPath;
}

const testDir = path.join(process.cwd(), 'Đạo lý 1');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

console.log('Long path:', testDir);
const short = getShortPath(testDir);
console.log('Short path:', short);

const binDir = path.join(process.cwd(), 'bin', 'whisper-cpu');
const exePath = path.join(binDir, 'whisper-cli.exe');
const modelPath = path.join(process.cwd(), 'bin', 'models', 'ggml-base.bin');
const dummyFile = path.join(testDir, 'test.wav');
if (!fs.existsSync(dummyFile)) fs.writeFileSync(dummyFile, Buffer.alloc(100));

console.log('--- TEST: Using Short Path for Whisper ---');
const args = [
    '-m', getShortPath(modelPath),
    '-f', getShortPath(dummyFile),
    '--print-progress'
];
console.log('Running with short paths:', args);

const result = spawnSync(exePath, args, {
    cwd: binDir,
    encoding: 'utf-8',
});

console.log('Exit Code:', result.status);
console.log('STDERR (first 200):', result.stderr?.substring(0, 200));
