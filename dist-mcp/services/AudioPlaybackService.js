"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioPlaybackService = void 0;
class AudioPlaybackService {
    _audio = null;
    _playingPath = null;
    _resolveCurrent = null;
    get isPlaying() {
        return this._audio !== null && !this._audio.paused;
    }
    get currentPath() {
        return this._playingPath;
    }
    async play(dataUrl) {
        this.stop();
        this._playingPath = dataUrl;
        return new Promise((resolve) => {
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
    stop() {
        if (this._audio) {
            this._audio.pause();
            this._audio.currentTime = 0;
        }
        this._cleanup();
    }
    _cleanup() {
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
exports.AudioPlaybackService = AudioPlaybackService;
//# sourceMappingURL=AudioPlaybackService.js.map