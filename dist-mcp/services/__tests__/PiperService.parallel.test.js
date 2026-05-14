"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const PiperService_1 = require("../PiperService");
(0, vitest_1.describe)('PiperService - Parallel Processing', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('should generate audio faster with parallel processing than sequential', async () => {
        const mockSynthesize = vitest_1.vi.spyOn(PiperService_1.engine, 'synthesizeToFile');
        mockSynthesize.mockImplementation(async (_text, _voice, outputPath) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
                fs_1.default.writeFileSync(outputPath, 'fake-audio-data');
            }
            catch { }
            return true;
        });
        const entries = [
            { index: 1, text: 'First segment' },
            { index: 2, text: 'Second segment' },
            { index: 3, text: 'Third segment' },
            { index: 4, text: 'Fourth segment' },
        ];
        const sequentialStart = Date.now();
        await (0, PiperService_1.generateAllAudio)(entries, 'en', './test-output', () => { }, 1);
        const sequentialTime = Date.now() - sequentialStart;
        mockSynthesize.mockClear();
        const parallelStart = Date.now();
        await (0, PiperService_1.generateAllAudio)(entries, 'en', './test-output', () => { }, 3);
        const parallelTime = Date.now() - parallelStart;
        (0, vitest_1.expect)(parallelTime).toBeLessThan(sequentialTime * 0.7);
        mockSynthesize.mockRestore();
    }, 15000);
    (0, vitest_1.it)('should respect concurrency limit', async () => {
        let activeCalls = 0;
        let maxConcurrent = 0;
        const mockSynthesize = vitest_1.vi.spyOn(PiperService_1.engine, 'synthesizeToFile');
        mockSynthesize.mockImplementation(async (_text, _voice, outputPath) => {
            activeCalls++;
            maxConcurrent = Math.max(maxConcurrent, activeCalls);
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
                fs_1.default.writeFileSync(outputPath, 'fake-audio-data');
            }
            catch { }
            activeCalls--;
            return true;
        });
        const entries = Array.from({ length: 10 }, (_, i) => ({
            index: i + 1,
            text: `Segment ${i + 1}`,
        }));
        const concurrencyLimit = 3;
        await (0, PiperService_1.generateAllAudio)(entries, 'en', './test-output', () => { }, concurrencyLimit);
        (0, vitest_1.expect)(mockSynthesize).toHaveBeenCalled();
        (0, vitest_1.expect)(maxConcurrent).toBeLessThanOrEqual(concurrencyLimit);
        (0, vitest_1.expect)(maxConcurrent).toBeGreaterThan(1);
        mockSynthesize.mockRestore();
    }, 15000);
});
(0, vitest_1.describe)('generateVoicePreview', () => {
    (0, vitest_1.it)('should generate 3 random preview samples', async () => {
        const { generateVoicePreview } = await import('../PiperService');
        const entries = Array.from({ length: 20 }, (_, i) => ({
            index: i + 1,
            text: `Sample text ${i + 1}`,
            startTime: '00:00:00,000',
            endTime: '00:00:02,000',
        }));
        const result = await generateVoicePreview(entries, 'en-US-JennyNeural', '/tmp/project', 3);
        (0, vitest_1.expect)(result.voiceId).toBe('en-US-JennyNeural');
        (0, vitest_1.expect)(result.samples.length).toBe(3);
        (0, vitest_1.expect)(result.samples[0].index).toBeGreaterThan(2);
        (0, vitest_1.expect)(result.samples[0].index).toBeLessThan(entries.length - 2);
    }, 15000);
    (0, vitest_1.it)('should use cache for repeated previews', async () => {
        const { generateVoicePreview } = await import('../PiperService');
        const entries = Array.from({ length: 10 }, (_, i) => ({
            index: i + 1,
            text: `Sample ${i + 1}`,
            startTime: '00:00:00,000',
            endTime: '00:00:02,000',
        }));
        const result1 = await generateVoicePreview(entries, 'en-US-GuyNeural', '/tmp/project', 3);
        const result2 = await generateVoicePreview(entries, 'en-US-GuyNeural', '/tmp/project', 3);
        (0, vitest_1.expect)(result1.samples).toEqual(result2.samples);
    }, 15000);
});
//# sourceMappingURL=PiperService.parallel.test.js.map