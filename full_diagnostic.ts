import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Constants from EnvironmentService logic
const binDir = path.join(process.cwd(), 'bin');
const whisperCpuDir = path.join(binDir, 'whisper-cpu');
const whisperCli = path.join(whisperCpuDir, 'whisper-cli.exe');
const ffmpegExe = path.join(binDir, 'ffmpeg', 'ffmpeg.exe');

const testWorkspace = path.join(process.cwd(), 'test_workspace_Đạo_lý');
if (!fs.existsSync(testWorkspace)) fs.mkdirSync(testWorkspace, { recursive: true });

async function testFfmpeg() {
    console.log('--- Testing FFmpeg with Vietnamese path ---');
    const outWav = path.join(testWorkspace, 'test_output.wav');
    // Create a dummy mp3 first
    const dummyMp3 = path.join(testWorkspace, 'input.mp3');
    // Just a silent wav for 1 second
    const args = [
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
        '-t', '1',
        '-y',
        outWav
    ];
    
    console.log('Running ffmpeg:', ffmpegExe, args.join(' '));
    const result = spawnSync(ffmpegExe, args, { encoding: 'utf-8' });
    console.log('FFmpeg Status:', result.status);
    if (result.status !== 0) {
        console.error('FFmpeg Error:', result.stderr);
    } else {
        console.log('FFmpeg Success. File created:', fs.existsSync(outWav));
    }
}

async function testWhisper() {
    console.log('\n--- Testing Whisper with Vietnamese path ---');
    const modelPath = path.join(binDir, 'models', 'ggml-base.bin');
    const wavPath = path.join(testWorkspace, 'test_output.wav');
    
    if (!fs.existsSync(modelPath)) {
        console.log('Model not found at', modelPath, '- skipping actual whisper run');
        return;
    }
    
    const args = [
        '-m', modelPath,
        '-f', wavPath,
        '-osrt'
    ];
    
    console.log('Running whisper:', whisperCli, args.join(' '));
    // Use chcp 65001 to see if it helps
    const result = spawnSync('cmd.exe', ['/c', 'chcp 65001 > nul && "' + whisperCli + '" ' + args.map(a => '"' + a + '"').join(' ')], {
        cwd: whisperCpuDir,
        encoding: 'utf-8',
        shell: true
    });
    
    console.log('Whisper Status:', result.status);
    console.log('Whisper Output (first 500):', result.stdout?.substring(0, 500) || result.stderr?.substring(0, 500));
}

async function runTests() {
    await testFfmpeg();
    await testWhisper();
    console.log('\nTests completed.');
}

runTests().catch(console.error);
