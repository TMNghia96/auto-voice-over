import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { generateAllAudio, engine } from '../PiperService';
import type { SrtEntryParams } from '../PiperService';

describe('PiperService - Parallel Processing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate audio faster with parallel processing than sequential', async () => {
        const mockSynthesize = vi.spyOn(engine, 'synthesizeToFile');
        mockSynthesize.mockImplementation(async (_text, _voice, outputPath) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            try { fs.writeFileSync(outputPath, 'fake-audio-data'); } catch {}
            return true;
        });

        const entries: SrtEntryParams[] = [
            { index: 1, text: 'First segment' },
            { index: 2, text: 'Second segment' },
            { index: 3, text: 'Third segment' },
            { index: 4, text: 'Fourth segment' },
        ];

        const sequentialStart = Date.now();
        await generateAllAudio(entries, 'en', './test-output', () => {}, 1);
        const sequentialTime = Date.now() - sequentialStart;

        mockSynthesize.mockClear();

        const parallelStart = Date.now();
        await generateAllAudio(entries, 'en', './test-output', () => {}, 3);
        const parallelTime = Date.now() - parallelStart;

        expect(parallelTime).toBeLessThan(sequentialTime * 0.7);
        mockSynthesize.mockRestore();
    }, 15000);

    it('should respect concurrency limit', async () => {
        let activeCalls = 0;
        let maxConcurrent = 0;

        const mockSynthesize = vi.spyOn(engine, 'synthesizeToFile');
        mockSynthesize.mockImplementation(async (_text, _voice, outputPath) => {
            activeCalls++;
            maxConcurrent = Math.max(maxConcurrent, activeCalls);
            await new Promise(resolve => setTimeout(resolve, 100));
            try { fs.writeFileSync(outputPath, 'fake-audio-data'); } catch {}
            activeCalls--;
            return true;
        });

        const entries: SrtEntryParams[] = Array.from({ length: 10 }, (_, i) => ({
            index: i + 1,
            text: `Segment ${i + 1}`,
        }));

        const concurrencyLimit = 3;
        await generateAllAudio(entries, 'en', './test-output', () => {}, concurrencyLimit);

        expect(mockSynthesize).toHaveBeenCalled();
        expect(maxConcurrent).toBeLessThanOrEqual(concurrencyLimit);
        expect(maxConcurrent).toBeGreaterThan(1);
        mockSynthesize.mockRestore();
    }, 15000);
});

describe('generateVoicePreview', () => {
    it('should generate 3 random preview samples', async () => {
        const { generateVoicePreview } = await import('../PiperService');
        const entries = Array.from({ length: 20 }, (_, i) => ({
            index: i + 1,
            text: `Sample text ${i + 1}`,
            startTime: '00:00:00,000',
            endTime: '00:00:02,000',
        }));
        const result = await generateVoicePreview(entries, 'en-US-JennyNeural', '/tmp/project', 3);
        expect(result.voiceId).toBe('en-US-JennyNeural');
        expect(result.samples.length).toBe(3);
        expect(result.samples[0].index).toBeGreaterThan(2);
        expect(result.samples[0].index).toBeLessThan(entries.length - 2);
    }, 15000);

    it('should use cache for repeated previews', async () => {
        const { generateVoicePreview } = await import('../PiperService');
        const entries = Array.from({ length: 10 }, (_, i) => ({
            index: i + 1,
            text: `Sample ${i + 1}`,
            startTime: '00:00:00,000',
            endTime: '00:00:02,000',
        }));
        const result1 = await generateVoicePreview(entries, 'en-US-GuyNeural', '/tmp/project', 3);
        const result2 = await generateVoicePreview(entries, 'en-US-GuyNeural', '/tmp/project', 3);
        expect(result1.samples).toEqual(result2.samples);
    }, 15000);
});