import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateAllAudio, engine } from '../PiperService';
import type { SrtEntryParams } from '../PiperService';

const BENCHMARK_DIR = path.join(__dirname, '..', '..', '..', 'test-output', 'benchmark');

describe('PiperService - Performance Benchmarks', () => {
    beforeEach(() => {
        if (fs.existsSync(BENCHMARK_DIR)) {
            fs.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(BENCHMARK_DIR, { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(BENCHMARK_DIR)) {
            fs.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
        }
    });

    it('should generate 20 entries faster with parallel processing', async () => {
        const mockSynthesize = vi.spyOn(engine, 'synthesizeToFile');
        mockSynthesize.mockImplementation(async (_text: string, _voice: string, outputPath: string) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            fs.writeFileSync(outputPath, 'fake-benchmark-audio');
            return true;
        });

        const entries: SrtEntryParams[] = Array.from({ length: 20 }, (_, i) => ({
            index: i + 1,
            text: `Benchmark segment ${i + 1}`,
        }));

        const onProgress = vi.fn();

        const sequentialStart = Date.now();
        await generateAllAudio(entries, 'en', path.join(BENCHMARK_DIR, 'seq'), onProgress, 1);
        const sequentialTime = Date.now() - sequentialStart;

        const parallelStart = Date.now();
        await generateAllAudio(entries, 'en', path.join(BENCHMARK_DIR, 'par'), onProgress, 5);
        const parallelTime = Date.now() - parallelStart;

        console.log(`Sequential time: ${sequentialTime}ms`);
        console.log(`Parallel time: ${parallelTime}ms`);
        console.log(`Speedup: ${(sequentialTime / parallelTime).toFixed(2)}x`);

        expect(parallelTime).toBeLessThan(sequentialTime / 2);

        mockSynthesize.mockRestore();
    }, 30000);
});