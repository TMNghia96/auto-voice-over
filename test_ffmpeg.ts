import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getFfmpegPath } from './src/services/EnvironmentService';
import { parseSrt, timeToSeconds } from './src/lib/SrtOptimizer';

async function testFailedSegs() {
    const projectPath = process.argv[2] || process.cwd(); // Assume we pass project path or defaults to a test
    // Actually we know project path: C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot
    const pPath = "C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot";
    
    // We already know the command for seg_10 and seg_11 was generated, we can simulate them.
    // Or we can just read temp_final/concat_list.txt to verify they are missing.
    // Let's run a test FFmpeg command for the gap segment 10.
    const run = (args) => new Promise(resolve => {
        const proc = spawn('ffmpeg', args, { windowsHide: true });
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => resolve({ code, stderr }));
    });
    
    // Let's test the gap filter logic directly!
    // If fadeFilter is invalid syntax, it throws immediately.
    const duration = 0.18;
    const fadeDur = Math.min(0.5, duration / 3); // 0.06
    const fadeStart = duration - fadeDur; // 0.12
    const bg = 0.1;
    const diff = 0.9;
    const expr = `min(0.10+0.90*min(1\\,t/0.060)\\,1.0-0.90*min(1\\,max(0\\,(t-0.120)/0.060)))`;
    
    const ffmpegArgs = [
        '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=24:d=0.18',
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-af', `volume=${expr}:eval=frame`,
        '-t', '0.18',
        'test_gap_10.mp4'
    ];
    
    const res = await run(ffmpegArgs);
    if (res.code !== 0) {
        console.error("GAP 10 FFmpeg Error:", res.stderr.slice(-1000));
    } else {
        console.log("GAP 10 SUCCESS");
    }
}
testFailedSegs();
