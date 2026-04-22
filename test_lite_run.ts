import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const getFfmpegPath = () => path.join(process.cwd(), 'bin', 'ffmpeg', 'ffmpeg.exe');

const runFfmpeg = (args) => {
    return new Promise((resolve) => {
        const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => resolve({ success: code === 0, stderr }));
    });
};

async function testLite() {
    const projectPath = "C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot";
    const vidFile = "original_video.mp4"; // Giả định
    const vidPath = path.join(projectPath, 'original', 'video', fs.readdirSync(path.join(projectPath, 'original', 'video'))[0]);
    
    const tempDir = path.join(projectPath, 'temp_test_lite');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    console.log("--- TEST CƠ CHẾ FFmpeg ---");
    
    // 1. Test Video TS segment
    console.log("1. Testing Video TS...");
    const vOut = path.join(tempDir, "test.ts");
    const vRes = await runFfmpeg(['-y', '-ss', '0', '-t', '1', '-i', vidPath, '-c:v', 'libx264', '-an', '-f', 'mpegts', vOut]);
    console.log(vRes.success ? "   OK" : "   FAILED: " + vRes.stderr.slice(-100));

    // 2. Test Audio WAV segment (với silent fallback để an toàn)
    console.log("2. Testing Audio WAV...");
    const aOut = path.join(tempDir, "test.wav");
    const aRes = await runFfmpeg(['-y', '-ss', '0', '-t', '1', '-i', vidPath, '-f', 'lavfi', '-i', 'anullsrc', '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first[a]', '-map', '[a]', '-c:a', 'pcm_s16le', aOut]);
    console.log(aRes.success ? "   OK" : "   FAILED: " + aRes.stderr.slice(-100));

    // 3. Test Concat & Merge
    if (vRes.success && aRes.success) {
        console.log("3. Testing Final Merge...");
        const final = path.join(tempDir, "final.mp4");
        const mRes = await runFfmpeg(['-y', '-i', vOut, '-i', aOut, '-c:v', 'copy', '-c:a', 'aac', final]);
        console.log(mRes.success ? "   OK" : "   FAILED");
    }

    console.log("--- KẾT THÚC ---");
}

testLite().catch(console.error);
