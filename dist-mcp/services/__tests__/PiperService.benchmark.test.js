"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PiperService_1 = require("../PiperService");
const BENCHMARK_DIR = path_1.default.join(__dirname, '..', '..', '..', 'test-output', 'benchmark');
(0, vitest_1.describe)('PiperService - Performance Benchmarks', () => {
    (0, vitest_1.beforeEach)(() => {
        if (fs_1.default.existsSync(BENCHMARK_DIR)) {
            fs_1.default.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
        }
        fs_1.default.mkdirSync(BENCHMARK_DIR, { recursive: true });
    });
    (0, vitest_1.afterEach)(() => {
        if (fs_1.default.existsSync(BENCHMARK_DIR)) {
            fs_1.default.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
        }
    });
    (0, vitest_1.it)('should generate 20 entries faster with parallel processing', async () => {
        const mockSynthesize = vitest_1.vi.spyOn(PiperService_1.engine, 'synthesizeToFile');
        mockSynthesize.mockImplementation(async (_text, _voice, outputPath) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            fs_1.default.writeFileSync(outputPath, 'fake-benchmark-audio');
            return true;
        });
        const entries = Array.from({ length: 20 }, (_, i) => ({
            index: i + 1,
            text: `Benchmark segment ${i + 1}`,
        }));
        const onProgress = vitest_1.vi.fn();
        const sequentialStart = Date.now();
        await (0, PiperService_1.generateAllAudio)(entries, 'en', path_1.default.join(BENCHMARK_DIR, 'seq'), onProgress, 1);
        const sequentialTime = Date.now() - sequentialStart;
        const parallelStart = Date.now();
        await (0, PiperService_1.generateAllAudio)(entries, 'en', path_1.default.join(BENCHMARK_DIR, 'par'), onProgress, 5);
        const parallelTime = Date.now() - parallelStart;
        console.log(`Sequential time: ${sequentialTime}ms`);
        console.log(`Parallel time: ${parallelTime}ms`);
        console.log(`Speedup: ${(sequentialTime / parallelTime).toFixed(2)}x`);
        (0, vitest_1.expect)(parallelTime).toBeLessThan(sequentialTime / 2);
        mockSynthesize.mockRestore();
    }, 30000);
});
//# sourceMappingURL=PiperService.benchmark.test.js.map