import { describe, it, expect, vi } from 'vitest';
import { generateAllAudio, _internal } from '../PiperService';
import type { SrtEntryParams } from '../PiperService';

describe('PiperService - Parallel Processing', () => {
    it('should generate audio faster with parallel processing than sequential', async () => {
        // Mock _internal.generateAudioSegment to simulate realistic delay
        const mockGenerateAudioSegment = vi.spyOn(_internal, 'generateAudioSegment');
        mockGenerateAudioSegment.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms per segment
            return true;
        });

        const entries: SrtEntryParams[] = [
            { index: 1, text: 'First segment' },
            { index: 2, text: 'Second segment' },
            { index: 3, text: 'Third segment' },
            { index: 4, text: 'Fourth segment' },
        ];

        const onProgress = vi.fn();

        // Sequential (concurrency = 1)
        const sequentialStart = Date.now();
        await generateAllAudio(entries, 'en', './test-output', onProgress, 1);
        const sequentialTime = Date.now() - sequentialStart;

        // Parallel (concurrency = 3)
        const parallelStart = Date.now();
        await generateAllAudio(entries, 'en', './test-output', onProgress, 3);
        const parallelTime = Date.now() - parallelStart;

        // Parallel should be significantly faster
        // With 4 segments at 100ms each:
        // Sequential: ~400ms
        // Parallel (3 concurrent): ~200ms (2 batches)
        expect(parallelTime).toBeLessThan(sequentialTime * 0.7);
        
        mockGenerateAudioSegment.mockRestore();
    }, 10000);

    it('should respect concurrency limit', async () => {
        let activeCalls = 0;
        let maxConcurrent = 0;

        // Mock _internal.generateAudioSegment to track concurrency
        const mockGenerateAudioSegment = vi.spyOn(_internal, 'generateAudioSegment');
        mockGenerateAudioSegment.mockImplementation(async () => {
            activeCalls++;
            maxConcurrent = Math.max(maxConcurrent, activeCalls);
            await new Promise(resolve => setTimeout(resolve, 100));
            activeCalls--;
            return true;
        });

        const entries: SrtEntryParams[] = Array.from({ length: 10 }, (_, i) => ({
            index: i + 1,
            text: `Segment ${i + 1}`,
        }));

        const onProgress = vi.fn();
        const concurrencyLimit = 3;

        await generateAllAudio(entries, 'en', './test-output', onProgress, concurrencyLimit);

        // Verify it was called
        expect(mockGenerateAudioSegment).toHaveBeenCalled();
        
        // Max concurrent should never exceed the limit
        expect(maxConcurrent).toBeLessThanOrEqual(concurrencyLimit);
        expect(maxConcurrent).toBeGreaterThan(1); // Should actually use parallelism
        
        mockGenerateAudioSegment.mockRestore();
    }, 10000);
});
