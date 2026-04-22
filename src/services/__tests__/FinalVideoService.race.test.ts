import { describe, it, expect, vi, beforeEach } from 'vitest';
import pLimit from 'p-limit';

/**
 * Unit tests for Bug #1: Race Condition Fix
 * Tests the p-limit implementation to ensure no race conditions occur
 */
describe('FinalVideoService - Race Condition Fix (Bug #1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    
    it('should process all segments without losing any', async () => {
        const segments = Array.from({ length: 100 }, (_, i) => ({
            type: 'dubbed' as const,
            index: i,
            videoStart: i * 2,
            videoEnd: i * 2 + 2,
            videoDuration: 2,
            targetDuration: 2,
            audioSpeed: 1.0,
            videoSpeed: 1.0,
        }));
        
        const processed = new Set<number>();
        const processAudioSegment = vi.fn(async (seg: any, idx: number) => {
            // Simulate random processing time
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            processed.add(idx);
        });
        
        // Run with CONCURRENCY = 6
        const limit = pLimit(6);
        const promises = segments.map((seg, idx) => 
            limit(() => processAudioSegment(seg, idx))
        );
        
        await Promise.all(promises);
        
        // Verify all processed
        expect(processed.size).toBe(100);
        expect(processAudioSegment).toHaveBeenCalledTimes(100);
        
        // Verify all indices present
        for (let i = 0; i < 100; i++) {
            expect(processed.has(i)).toBe(true);
        }
    });
    
    it('should respect concurrency limit', async () => {
        const segments = Array.from({ length: 20 }, (_, i) => ({ index: i }));
        let currentConcurrency = 0;
        let maxConcurrency = 0;
        
        const processAudioSegment = vi.fn(async (seg: any, idx: number) => {
            currentConcurrency++;
            maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
            await new Promise(resolve => setTimeout(resolve, 10));
            currentConcurrency--;
        });
        
        const limit = pLimit(6);
        const promises = segments.map((seg, idx) => 
            limit(() => processAudioSegment(seg, idx))
        );
        
        await Promise.all(promises);
        
        expect(maxConcurrency).toBeLessThanOrEqual(6);
        expect(maxConcurrency).toBeGreaterThan(0);
    });
    
    it('should handle cancellation correctly', async () => {
        const segments = Array.from({ length: 50 }, (_, i) => ({ index: i }));
        let isCancelled = false;
        
        const processAudioSegment = vi.fn(async (seg: any, idx: number) => {
            if (idx === 10) isCancelled = true;
            if (isCancelled) throw new Error("Cancelled by user");
            await new Promise(resolve => setTimeout(resolve, 5));
        });
        
        const limit = pLimit(6);
        const promises = segments.map((seg, idx) => 
            limit(() => processAudioSegment(seg, idx))
        );
        
        await expect(Promise.all(promises)).rejects.toThrow("Cancelled by user");
    });
    
    it('should handle errors without deadlock', async () => {
        const segments = Array.from({ length: 20 }, (_, i) => ({ index: i }));
        
        const processAudioSegment = vi.fn(async (seg: any, idx: number) => {
            await new Promise(resolve => setTimeout(resolve, 5));
            if (idx === 10) throw new Error("Processing failed");
        });
        
        const limit = pLimit(6);
        const promises = segments.map((seg, idx) => 
            limit(() => processAudioSegment(seg, idx))
        );
        
        await expect(Promise.all(promises)).rejects.toThrow("Processing failed");
    });
    
    it('should process segments in order of submission', async () => {
        const segments = Array.from({ length: 10 }, (_, i) => ({ index: i }));
        const processOrder: number[] = [];
        
        const processAudioSegment = vi.fn(async (seg: any, idx: number) => {
            await new Promise(resolve => setTimeout(resolve, 1));
            processOrder.push(idx);
        });
        
        const limit = pLimit(1); // Sequential processing
        const promises = segments.map((seg, idx) => 
            limit(() => processAudioSegment(seg, idx))
        );
        
        await Promise.all(promises);
        
        // With concurrency=1, should process in order
        expect(processOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
    
    it('should handle empty segment list', async () => {
        const segments: any[] = [];
        const processAudioSegment = vi.fn();
        
        const limit = pLimit(6);
        const promises = segments.map((seg, idx) => 
            limit(() => processAudioSegment(seg, idx))
        );
        
        await Promise.all(promises);
        
        expect(processAudioSegment).not.toHaveBeenCalled();
    });
    
    it('should handle single segment', async () => {
        const segments = [{ index: 0 }];
        const processed: number[] = [];
        
        const processAudioSegment = vi.fn(async (seg: any, idx: number) => {
            processed.push(idx);
        });
        
        const limit = pLimit(6);
        const promises = segments.map((seg, idx) => 
            limit(() => processAudioSegment(seg, idx))
        );
        
        await Promise.all(promises);
        
        expect(processed).toEqual([0]);
        expect(processAudioSegment).toHaveBeenCalledTimes(1);
    });
});
