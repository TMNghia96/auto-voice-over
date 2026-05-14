"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const PiperService = __importStar(require("../PiperService"));
const engine = PiperService.engine;
const TEST_DIR = path_1.default.join(__dirname, '..', '..', '..', 'test-output', 'integration');
(0, vitest_1.describe)('PiperService - Integration', () => {
    (0, vitest_1.beforeEach)(() => {
        if (fs_1.default.existsSync(TEST_DIR)) {
            fs_1.default.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        fs_1.default.mkdirSync(TEST_DIR, { recursive: true });
    });
    (0, vitest_1.afterEach)(() => {
        if (fs_1.default.existsSync(TEST_DIR)) {
            fs_1.default.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });
    (0, vitest_1.it)('should generate audio for multiple entries in parallel', async () => {
        const mockGen = vitest_1.vi.spyOn(engine, 'synthesizeToFile');
        mockGen.mockImplementation(async (_text, _voice, outputPath) => {
            await new Promise(resolve => setTimeout(resolve, 50));
            fs_1.default.mkdirSync(path_1.default.dirname(outputPath), { recursive: true });
            fs_1.default.writeFileSync(outputPath, 'fake-audio-data');
            return true;
        });
        const entries = [
            { index: 1, text: 'First segment' },
            { index: 2, text: 'Second segment' },
            { index: 3, text: 'Third segment' },
        ];
        const onProgress = vitest_1.vi.fn();
        const results = await PiperService.generateAllAudio(entries, 'en', TEST_DIR, onProgress, 3);
        (0, vitest_1.expect)(results).toHaveLength(3);
        results.forEach((filePath) => {
            (0, vitest_1.expect)(fs_1.default.existsSync(filePath)).toBe(true);
        });
        mockGen.mockRestore();
    }, 10000);
    (0, vitest_1.it)('should generate and cache voice previews', async () => {
        const mockGen = vitest_1.vi.spyOn(engine, 'synthesizeToFile');
        mockGen.mockImplementation(async (_text, _voice, outputPath) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            fs_1.default.mkdirSync(path_1.default.dirname(outputPath), { recursive: true });
            fs_1.default.writeFileSync(outputPath, 'fake-preview-audio');
            return true;
        });
        const entries = Array.from({ length: 10 }, (_, i) => ({
            index: i + 1,
            text: `Sample text ${i + 1}`,
            startTime: '00:00:00,000',
            endTime: '00:00:02,000',
        }));
        const firstStart = Date.now();
        const result1 = await PiperService.generateVoicePreview(entries, 'en-US-JennyNeural', TEST_DIR, 3);
        const firstDuration = Date.now() - firstStart;
        (0, vitest_1.expect)(result1.samples.length).toBe(3);
        const secondStart = Date.now();
        const result2 = await PiperService.generateVoicePreview(entries, 'en-US-JennyNeural', TEST_DIR, 3);
        const secondDuration = Date.now() - secondStart;
        (0, vitest_1.expect)(secondDuration).toBeLessThan(100);
        (0, vitest_1.expect)(result1.samples).toEqual(result2.samples);
        mockGen.mockRestore();
    }, 10000);
    (0, vitest_1.it)('should cleanup old preview caches', async () => {
        const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        const voiceDir = path_1.default.join(TEST_DIR, '.auto-voice-over', 'previews', 'test-voice-old');
        fs_1.default.mkdirSync(voiceDir, { recursive: true });
        const cacheFile = path_1.default.join(voiceDir, 'cache.json');
        fs_1.default.writeFileSync(cacheFile, JSON.stringify({ voiceId: 'test', samples: [] }));
        fs_1.default.utimesSync(cacheFile, oldDate, oldDate);
        const freshVoiceDir = path_1.default.join(TEST_DIR, '.auto-voice-over', 'previews', 'test-voice-fresh');
        fs_1.default.mkdirSync(freshVoiceDir, { recursive: true });
        const freshCache = path_1.default.join(freshVoiceDir, 'cache.json');
        fs_1.default.writeFileSync(freshCache, JSON.stringify({ voiceId: 'test2', samples: [] }));
        PiperService.cleanupOldPreviews(path_1.default.join(TEST_DIR));
        (0, vitest_1.expect)(fs_1.default.existsSync(cacheFile)).toBe(false);
        (0, vitest_1.expect)(fs_1.default.existsSync(voiceDir)).toBe(false);
        (0, vitest_1.expect)(fs_1.default.existsSync(freshCache)).toBe(true);
    });
});
//# sourceMappingURL=PiperService.integration.test.js.map