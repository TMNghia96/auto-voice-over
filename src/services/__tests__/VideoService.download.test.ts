import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));

vi.mock('../EnvironmentService', () => ({
  getYtDlpPath: () => 'yt-dlp.exe',
  getFfmpegPath: () => 'ffmpeg.exe',
}));

const makeProcess = () => {
  const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
};

describe('downloadVideo', () => {
  let tempDir = '';

  afterEach(() => {
    vi.resetModules();
    spawnMock.mockReset();
    if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('moves staged files and returns paths when both downloads succeed', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-download-'));
    const videoProc = makeProcess();
    const audioProc = makeProcess();
    spawnMock.mockReturnValueOnce(videoProc).mockReturnValueOnce(audioProc);

    const { downloadVideo } = await import('../VideoService');
    const resultPromise = downloadVideo('https://example.com/video', tempDir, () => undefined);

    const stagingVideoDir = path.join(tempDir, 'original', '.staging-download', 'video');
    const stagingAudioDir = path.join(tempDir, 'original', '.staging-download', 'audio');
    fs.writeFileSync(path.join(stagingVideoDir, 'abc.mp4'), 'video');
    fs.writeFileSync(path.join(stagingAudioDir, 'abc.mp3'), 'audio');

    videoProc.emit('close', 0);
    audioProc.emit('close', 0);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.videoPath).toBe(path.join(tempDir, 'original', 'video', 'abc.mp4'));
    expect(result.audioPath).toBe(path.join(tempDir, 'original', 'audio', 'abc.mp3'));
    expect(fs.existsSync(result.videoPath!)).toBe(true);
    expect(fs.existsSync(result.audioPath!)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'original', '.staging-download'))).toBe(false);
  });

  it('returns failure details when video download exits non-zero even if audio succeeds', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-download-'));
    const videoProc = makeProcess();
    const audioProc = makeProcess();
    spawnMock.mockReturnValueOnce(videoProc).mockReturnValueOnce(audioProc);
    const progress: Array<{ video: number; audio: number }> = [];

    const { downloadVideo } = await import('../VideoService');
    const resultPromise = downloadVideo('https://example.com/video', tempDir, (p) => progress.push(p));

    videoProc.stderr.emit('data', Buffer.from('format unavailable'));
    videoProc.emit('close', 1);
    audioProc.emit('close', 0);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.videoExitCode).toBe(1);
    expect(result.error).toContain('format unavailable');
    expect(progress).not.toContainEqual({ video: 100, audio: 100 });
    expect(fs.existsSync(path.join(tempDir, 'original', '.staging-download'))).toBe(false);
  });

  it('kills both child processes and cleans staging when aborted', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-download-'));
    const videoProc = makeProcess();
    const audioProc = makeProcess();
    spawnMock.mockReturnValueOnce(videoProc).mockReturnValueOnce(audioProc);
    const controller = new AbortController();

    const { downloadVideo } = await import('../VideoService');
    const resultPromise = downloadVideo('https://example.com/video', tempDir, () => undefined, { signal: controller.signal });

    const stagingVideoDir = path.join(tempDir, 'original', '.staging-download', 'video');
    fs.writeFileSync(path.join(stagingVideoDir, 'partial.mp4'), 'partial');

    controller.abort();
    expect(videoProc.kill).toHaveBeenCalled();
    expect(audioProc.kill).toHaveBeenCalled();

    videoProc.emit('close', null);
    audioProc.emit('close', null);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'original', '.staging-download'))).toBe(false);
  });
});
