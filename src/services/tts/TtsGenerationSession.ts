export interface TTSProgress {
  status: 'generating' | 'done' | 'error';
  progress: number;
  detail: string;
  current?: number;
  total?: number;
  entryIndex?: number;
  entryStatus?: 'start' | 'done' | 'failed';
}

export class TtsGenerationSession {
  readonly sessionId: string;
  private _abortController: AbortController;
  private _onProgress: Array<(p: TTSProgress) => void> = [];
  private _resultPromise: Promise<unknown>;
  private _cancelled = false;

  constructor(
    sessionId: string,
    resultPromise: Promise<unknown>,
    abortController: AbortController,
  ) {
    this.sessionId = sessionId;
    this._resultPromise = resultPromise;
    this._abortController = abortController;
  }

  get signal(): AbortSignal {
    return this._abortController.signal;
  }

  get result(): Promise<unknown> {
    return this._resultPromise;
  }

  get cancelled(): boolean {
    return this._cancelled;
  }

  cancel(): void {
    this._cancelled = true;
    this._abortController.abort();
  }

  onProgress(callback: (p: TTSProgress) => void): () => void {
    this._onProgress.push(callback);
    return () => {
      this._onProgress = this._onProgress.filter((cb) => cb !== callback);
    };
  }

  emitProgress(p: TTSProgress): void {
    for (const cb of this._onProgress) {
      try { cb(p); } catch { /* swallow */ }
    }
  }
}