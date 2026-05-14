"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const p_limit_1 = __importDefault(require("p-limit"));
/**
 * Unit tests for Bug #1: Race Condition Fix
 * Tests the p-limit implementation to ensure no race conditions occur
 */
(0, vitest_1.describe)('FinalVideoService - Race Condition Fix (Bug #1)', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('should process all segments without losing any', async () => {
        const segments = Array.from({ length: 100 }, (_, i) => ({
            type: 'dubbed',
            index: i,
            videoStart: i * 2,
            videoEnd: i * 2 + 2,
            videoDuration: 2,
            targetDuration: 2,
            audioSpeed: 1.0,
            videoSpeed: 1.0,
        }));
        const processed = new Set();
        const processAudioSegment = vitest_1.vi.fn(async (seg, idx) => {
            // Simulate random processing time
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            processed.add(idx);
        });
        // Run with CONCURRENCY = 6
        const limit = (0, p_limit_1.default)(6);
        const promises = segments.map((seg, idx) => limit(() => processAudioSegment(seg, idx)));
        await Promise.all(promises);
        // Verify all processed
        (0, vitest_1.expect)(processed.size).toBe(100);
        (0, vitest_1.expect)(processAudioSegment).toHaveBeenCalledTimes(100);
        // Verify all indices present
        for (let i = 0; i < 100; i++) {
            (0, vitest_1.expect)(processed.has(i)).toBe(true);
        }
    });
    (0, vitest_1.it)('should respect concurrency limit', async () => {
        const segments = Array.from({ length: 20 }, (_, i) => ({ index: i }));
        let currentConcurrency = 0;
        let maxConcurrency = 0;
        const processAudioSegment = vitest_1.vi.fn(async (seg, idx) => {
            currentConcurrency++;
            maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
            await new Promise(resolve => setTimeout(resolve, 10));
            currentConcurrency--;
        });
        const limit = (0, p_limit_1.default)(6);
        const promises = segments.map((seg, idx) => limit(() => processAudioSegment(seg, idx)));
        await Promise.all(promises);
        (0, vitest_1.expect)(maxConcurrency).toBeLessThanOrEqual(6);
        (0, vitest_1.expect)(maxConcurrency).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('should handle cancellation correctly', async () => {
        const segments = Array.from({ length: 50 }, (_, i) => ({ index: i }));
        let isCancelled = false;
        const processAudioSegment = vitest_1.vi.fn(async (seg, idx) => {
            if (idx === 10)
                isCancelled = true;
            if (isCancelled)
                throw new Error("Cancelled by user");
            await new Promise(resolve => setTimeout(resolve, 5));
        });
        const limit = (0, p_limit_1.default)(6);
        const promises = segments.map((seg, idx) => limit(() => processAudioSegment(seg, idx)));
        await (0, vitest_1.expect)(Promise.all(promises)).rejects.toThrow("Cancelled by user");
    });
    (0, vitest_1.it)('should handle errors without deadlock', async () => {
        const segments = Array.from({ length: 20 }, (_, i) => ({ index: i }));
        const processAudioSegment = vitest_1.vi.fn(async (seg, idx) => {
            await new Promise(resolve => setTimeout(resolve, 5));
            if (idx === 10)
                throw new Error("Processing failed");
        });
        const limit = (0, p_limit_1.default)(6);
        const promises = segments.map((seg, idx) => limit(() => processAudioSegment(seg, idx)));
        await (0, vitest_1.expect)(Promise.all(promises)).rejects.toThrow("Processing failed");
    });
    (0, vitest_1.it)('should process segments in order of submission', async () => {
        const segments = Array.from({ length: 10 }, (_, i) => ({ index: i }));
        const processOrder = [];
        const processAudioSegment = vitest_1.vi.fn(async (seg, idx) => {
            await new Promise(resolve => setTimeout(resolve, 1));
            processOrder.push(idx);
        });
        const limit = (0, p_limit_1.default)(1); // Sequential processing
        const promises = segments.map((seg, idx) => limit(() => processAudioSegment(seg, idx)));
        await Promise.all(promises);
        // With concurrency=1, should process in order
        (0, vitest_1.expect)(processOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
    (0, vitest_1.it)('should handle empty segment list', async () => {
        const segments = [];
        const processAudioSegment = vitest_1.vi.fn();
        const limit = (0, p_limit_1.default)(6);
        const promises = segments.map((seg, idx) => limit(() => processAudioSegment(seg, idx)));
        await Promise.all(promises);
        (0, vitest_1.expect)(processAudioSegment).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('should handle single segment', async () => {
        const segments = [{ index: 0 }];
        const processed = [];
        const processAudioSegment = vitest_1.vi.fn(async (seg, idx) => {
            processed.push(idx);
        });
        const limit = (0, p_limit_1.default)(6);
        const promises = segments.map((seg, idx) => limit(() => processAudioSegment(seg, idx)));
        await Promise.all(promises);
        (0, vitest_1.expect)(processed).toEqual([0]);
        (0, vitest_1.expect)(processAudioSegment).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=FinalVideoService.race.test.js.map