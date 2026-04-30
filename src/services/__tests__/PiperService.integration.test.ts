import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import * as PiperService from '../PiperService';
import type { SrtEntryParams } from '../PiperService';

const TEST_DIR = path.join(__dirname, '..', '..', '..', 'test-output', 'integration');

describe('PiperService - Integration', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('should generate audio for multiple entries in parallel', async () => {
        const mockGen = vi.spyOn(PiperService._internal, 'generateAudioSegment');
        mockGen.mockImplementation(async (_text: string, _voice: string, outputPath: string) => {
            await new Promise(resolve => setTimeout(resolve, 50));
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, 'fake-audio-data');
            return true;
        });

        const entries: SrtEntryParams[] = [
            { index: 1, text: 'First segment' },
            { index: 2, text: 'Second segment' },
            { index: 3, text: 'Third segment' },
        ];

        const onProgress = vi.fn();
        const results = await PiperService.generateAllAudio(entries, 'en', TEST_DIR, onProgress, 3);

        expect(results).toHaveLength(3);
        results.forEach((filePath) => {
            expect(fs.existsSync(filePath)).toBe(true);
        });

        mockGen.mockRestore();
    }, 10000);

    it('should generate and cache voice previews', async () => {
        const mockGen = vi.spyOn(PiperService._internal, 'generateAudioSegment');
        mockGen.mockImplementation(async (_text: string, _voice: string, outputPath: string) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, 'fake-preview-audio');
            return true;
        });

        const entries: SrtEntryParams[] = Array.from({ length: 10 }, (_, i) => ({
            index: i + 1,
            text: `Sample text ${i + 1}`,
            startTime: '00:00:00,000',
            endTime: '00:00:02,000',
        }));

        const firstStart = Date.now();
        const result1 = await PiperService.generateVoicePreview(entries, 'en-US-JennyNeural', TEST_DIR, 3);
        const firstDuration = Date.now() - firstStart;

        expect(result1.samples.length).toBe(3);

        const secondStart = Date.now();
        const result2 = await PiperService.generateVoicePreview(entries, 'en-US-JennyNeural', TEST_DIR, 3);
        const secondDuration = Date.now() - secondStart;

        expect(secondDuration).toBeLessThan(100);
        expect(result1.samples).toEqual(result2.samples);

        mockGen.mockRestore();
    }, 10000);

    it('should cleanup old preview caches', async () => {
        const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        const voiceDir = path.join(TEST_DIR, '.auto-voice-over', 'previews', 'test-voice-old');
        fs.mkdirSync(voiceDir, { recursive: true });
        const cacheFile = path.join(voiceDir, 'cache.json');
        fs.writeFileSync(cacheFile, JSON.stringify({ voiceId: 'test', samples: [] }));
        fs.utimesSync(cacheFile, oldDate, oldDate);

        const freshVoiceDir = path.join(TEST_DIR, '.auto-voice-over', 'previews', 'test-voice-fresh');
        fs.mkdirSync(freshVoiceDir, { recursive: true });
        const freshCache = path.join(freshVoiceDir, 'cache.json');
        fs.writeFileSync(freshCache, JSON.stringify({ voiceId: 'test2', samples: [] }));

        PiperService.cleanupOldPreviews(path.join(TEST_DIR));

        expect(fs.existsSync(cacheFile)).toBe(false);
        expect(fs.existsSync(voiceDir)).toBe(false);
        expect(fs.existsSync(freshCache)).toBe(true);
    });
});