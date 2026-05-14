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
  const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
};

describe('downloadVideo', () => {
  let tempDir = '';

  afterEach(() => {
    vi.resetModules();
    spawnMock.mockReset();
    if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when video download exits non-zero even if audio succeeds', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-download-'));
    const videoProc = makeProcess();
    const audioProc = makeProcess();
    spawnMock.mockReturnValueOnce(videoProc).mockReturnValueOnce(audioProc);

    const { downloadVideo } = await import('../VideoService');
    const resultPromise = downloadVideo('https://example.com/video', tempDir, () => undefined);

    videoProc.emit('close', 1);
    audioProc.emit('close', 0);

    await expect(resultPromise).resolves.toBe(false);
  });
});
