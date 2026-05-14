"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtsGenerationSession = void 0;
class TtsGenerationSession {
    sessionId;
    _abortController;
    _onProgress = [];
    _resultPromise;
    _cancelled = false;
    constructor(sessionId, resultPromise, abortController) {
        this.sessionId = sessionId;
        this._resultPromise = resultPromise;
        this._abortController = abortController;
    }
    get signal() {
        return this._abortController.signal;
    }
    get result() {
        return this._resultPromise;
    }
    get cancelled() {
        return this._cancelled;
    }
    cancel() {
        this._cancelled = true;
        this._abortController.abort();
    }
    onProgress(callback) {
        this._onProgress.push(callback);
        return () => {
            this._onProgress = this._onProgress.filter((cb) => cb !== callback);
        };
    }
    emitProgress(p) {
        for (const cb of this._onProgress) {
            try {
                cb(p);
            }
            catch { /* swallow */ }
        }
    }
}
exports.TtsGenerationSession = TtsGenerationSession;
//# sourceMappingURL=TtsGenerationSession.js.map