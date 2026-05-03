export class AudioPlaybackService {
  private _audio: HTMLAudioElement | null = null;
  private _playingPath: string | null = null;
  private _resolveCurrent: (() => void) | null = null;

  get isPlaying(): boolean {
    return this._audio !== null && !this._audio.paused;
  }

  get currentPath(): string | null {
    return this._playingPath;
  }

  async play(dataUrl: string): Promise<void> {
    this.stop();
    this._playingPath = dataUrl;

    return new Promise<void>((resolve) => {
      const audio = new Audio(dataUrl);
      this._audio = audio;
      this._resolveCurrent = resolve;

      audio.onended = () => {
        this._cleanup();
        resolve();
      };

      audio.onerror = () => {
        this._cleanup();
        resolve();
      };

      audio.play().catch(() => {
        this._cleanup();
        resolve();
      });
    });
  }

  stop(): void {
    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
    }
    this._cleanup();
  }

  private _cleanup(): void {
    if (this._audio) {
      this._audio.onended = null;
      this._audio.onerror = null;
      this._audio = null;
    }
    this._playingPath = null;
    if (this._resolveCurrent) {
      this._resolveCurrent();
      this._resolveCurrent = null;
    }
  }
}