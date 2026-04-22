import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const binDir = path.join(process.cwd(), 'bin', 'whisper-cpu');
const exePath = path.join(binDir, 'whisper-cli.exe');
const modelPath = path.join(process.cwd(), 'bin', 'models', 'ggml-base.bin');

// Create a dummy dir with Vietnamese name
const testDir = path.join(process.cwd(), 'Đạo lý 1');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

const dummyFile = path.join(testDir, 'test.wav');
// Create a 1-byte dummy file if not exists
if (!fs.existsSync(dummyFile)) fs.writeFileSync(dummyFile, Buffer.alloc(100));

console.log('--- TEST 1: Path argument with spaces and Vietnamese ---');
const args = [
    '-m', modelPath,
    '-f', dummyFile,
    '--print-progress'
];
console.log('Running:', exePath, args.join(' '));

const result = spawnSync(exePath, args, {
    cwd: binDir,
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf-8',
});

console.log('Exit Code:', result.status);
if (result.stdout && result.stdout.length > 0) {
    console.log('STDOUT (first 200 chars):', JSON.stringify(result.stdout.substring(0, 200)));
}
if (result.stderr && result.stderr.length > 0) {
    console.log('STDERR (first 500 chars):', JSON.stringify(result.stderr.substring(0, 500)));
    if (result.stderr.includes('usage:')) {
        console.log('!!! Help message detected in STDERR - Command arguments were likely invalid.');
    }
}
