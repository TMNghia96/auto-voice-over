import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getFfmpegPath, getFfprobePath } from './src/services/EnvironmentService';

async function checkSegments() {
    const dir = "C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot\\temp_final";
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));
    console.log("Found", files.length, "TS files");
    files.sort();

    const checkFile = (f: string) => new Promise((resolve) => {
        const proc = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration:stream=codec_type,nb_read_frames',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            path.join(dir, f)
        ], { windowsHide: true });
        
        let out = '';
        proc.stdout.on('data', d => out += d.toString());
        proc.on('close', () => {
            resolve({ file: f, out: out.trim().split(/\r?\n/) });
        });
    });

    const results = [];
    // Check first 15 files
    for (const f of files.slice(0, 15)) {
        const res = await checkFile(f);
        results.push(res);
    }

    console.log(JSON.stringify(results, null, 2));
}

checkSegments();
