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

async function testAMF() {
    const projectPath = "C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot";
    const vDir = path.join(projectPath, 'original', 'video');
    const vidFile = fs.readdirSync(vDir).find(f => /\.(mp4|mkv|webm|avi|mov)$/i.test(f));
    const vidPath = path.join(vDir, vidFile);
    
    const tempDir = path.join(projectPath, 'temp_test_amf');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    console.log("--- TEST AMF ENCODER ---");
    const vOut = path.join(tempDir, "test_amf.ts");
    
    // Command from FinalVideoService.ts for AMD
    const vArgs = ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '20', '-qp_b', '20'];
    const vCmd = ['-y', '-ss', '0', '-t', '1', '-i', vidPath, '-an', ...vArgs, '-f', 'mpegts', vOut];
    
    console.log("Running command:", ['ffmpeg', ...vCmd].join(' '));
    const vRes = await runFfmpeg(vCmd);
    
    if (vRes.success) {
        console.log("AMF encode SUCCESS!");
        console.log(`File size: ${fs.statSync(vOut).size} bytes`);
    } else {
        console.log("AMF encode FAILED!");
        console.log("ERROR OUTPUT:\n", vRes.stderr);
    }
}

testAMF().catch(console.error);
