import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getFfprobePath } from '../src/services/EnvironmentService';

type ProbeInfo = {
  duration: number;
  avgFrameRate: string;
  rFrameRate: string;
  nbFrames: string;
};

function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffprobe = getFfprobePath();
    const proc = spawn(ffprobe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`ffprobe exit ${code}: ${stderr.trim()}`));
      }
    });
    proc.on('error', (err) => reject(err));
  });
}

function parseRate(rate: string): number {
  const [num, den] = rate.split('/').map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

async function probeVideo(videoPath: string): Promise<ProbeInfo> {
  const raw = await runFfprobe([
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=avg_frame_rate,r_frame_rate,nb_frames:format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=0',
    videoPath,
  ]);

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const map = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      map.set(line.slice(0, idx), line.slice(idx + 1));
    }
  }

  return {
    duration: parseFloat(map.get('duration') || '0'),
    avgFrameRate: map.get('avg_frame_rate') || '0/0',
    rFrameRate: map.get('r_frame_rate') || '0/0',
    nbFrames: map.get('nb_frames') || 'N/A',
  };
}

async function probeDuration(mediaPath: string): Promise<number> {
  const raw = await runFfprobe([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    mediaPath,
  ]);
  return parseFloat(raw.trim() || '0');
}

async function main() {
  const projectPath = process.argv[2];
  if (!projectPath) {
    throw new Error('Usage: npx tsx scripts/verify-final-video.ts <projectPath>');
  }

  const finalVideoPath = path.join(projectPath, 'final', 'final_video.mp4');
  const mixedAudioPath = path.join(projectPath, 'temp_final', 'final_mixed_audio.wav');
  const concatedVideoPath = path.join(projectPath, 'temp_final', 'concated_video.mp4');

  if (!fs.existsSync(finalVideoPath)) {
    throw new Error(`Missing file: ${finalVideoPath}`);
  }

  const videoInfo = await probeVideo(finalVideoPath);
  const avgFps = parseRate(videoInfo.avgFrameRate);
  const rFps = parseRate(videoInfo.rFrameRate);

  console.log('=== Final Video Check ===');
  console.log(`video: ${finalVideoPath}`);
  console.log(`duration: ${videoInfo.duration.toFixed(3)}s`);
  console.log(`avg_frame_rate: ${videoInfo.avgFrameRate} (~${avgFps.toFixed(3)} fps)`);
  console.log(`r_frame_rate: ${videoInfo.rFrameRate} (~${rFps.toFixed(3)} fps)`);
  console.log(`nb_frames: ${videoInfo.nbFrames}`);

  const fpsOk = Math.abs(avgFps - 30) < 0.2 && Math.abs(rFps - 30) < 0.2;
  console.log(`fps_check_30: ${fpsOk ? 'PASS' : 'FAIL'}`);

  if (fs.existsSync(mixedAudioPath) && fs.existsSync(concatedVideoPath)) {
    const mixedAudioDuration = await probeDuration(mixedAudioPath);
    const concatedVideoDuration = await probeDuration(concatedVideoPath);
    const delta = Math.abs(mixedAudioDuration - concatedVideoDuration);

    console.log('\n=== Temp Stream Alignment ===');
    console.log(`concated_video: ${concatedVideoDuration.toFixed(3)}s`);
    console.log(`final_mixed_audio: ${mixedAudioDuration.toFixed(3)}s`);
    console.log(`abs_delta: ${delta.toFixed(3)}s`);
    console.log(`delta_check_0.1s: ${delta <= 0.1 ? 'PASS' : 'FAIL'}`);
  } else {
    console.log('\nTemp files not found, skipped alignment check.');
  }
}

main().catch((err) => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
