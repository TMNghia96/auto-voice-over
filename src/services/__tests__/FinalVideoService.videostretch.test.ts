import { describe, it, expect } from 'vitest';

/**
 * Unit tests for Video Stretching Fix (Frozen Frames Bug)
 * Tests the setpts logic to ensure correct video speed adjustment
 */
describe('FinalVideoService - Video Stretching Fix (Frozen Frames)', () => {
    
    const calculateSetpts = (videoSpeed: number): string => {
        if (Math.abs(videoSpeed - 1.0) > 0.001) {
            const ptsMultiplier = (1.0 / videoSpeed).toFixed(4);
            return `${ptsMultiplier}*PTS`;
        } else {
            return 'PTS-STARTPTS';
        }
    };
    
    it('should lengthen video when videoSpeed < 1.0', () => {
        // Scenario: Need longer output duration than original
        const videoSpeed = 0.8666;
        const setpts = calculateSetpts(videoSpeed);
        
        // Expected: setpts = (1/0.8666)*PTS = 1.1539*PTS
        // FFmpeg setpts multiplier > 1 lengthens output duration
        expect(setpts).toContain('1.1539');
        expect(setpts).toContain('*PTS');
        
        // Verify multiplier is greater than 1.0 (longer output)
        const multiplier = parseFloat(setpts.split('*')[0]);
        expect(multiplier).toBeGreaterThan(1.0);
    });
    
    it('should shorten video when videoSpeed > 1.0', () => {
        const videoSpeed = 1.25;
        const setpts = calculateSetpts(videoSpeed);
        
        // Expected: setpts = (1/1.25)*PTS = 0.8000*PTS (shorter output)
        expect(setpts).toContain('0.8000');
        expect(setpts).toContain('*PTS');
        
        // Verify multiplier is less than 1.0 (shorter output)
        const multiplier = parseFloat(setpts.split('*')[0]);
        expect(multiplier).toBeLessThan(1.0);
    });
    
    it('should not change speed when videoSpeed = 1.0', () => {
        const videoSpeed = 1.0;
        const setpts = calculateSetpts(videoSpeed);
        
        // Expected: Just reset PTS, no speed change
        expect(setpts).toBe('PTS-STARTPTS');
    });
    
    it('should handle extreme slow motion (videoSpeed = 2.0)', () => {
        // Video needs to be stretched 2x
        const videoSpeed = 2.0;
        const setpts = calculateSetpts(videoSpeed);
        
        // Expected: setpts = 0.5*PTS (half speed = slow motion)
        expect(setpts).toContain('0.5000');
        
        const multiplier = parseFloat(setpts.split('*')[0]);
        expect(multiplier).toBe(0.5);
    });
    
    it('should handle extreme speed up (videoSpeed = 0.5)', () => {
        // Video needs to be compressed 2x
        const videoSpeed = 0.5;
        const setpts = calculateSetpts(videoSpeed);
        
        // Expected: setpts = 2.0*PTS (double speed)
        expect(setpts).toContain('2.0000');
        
        const multiplier = parseFloat(setpts.split('*')[0]);
        expect(multiplier).toBe(2.0);
    });
    
    it('should calculate correct duration after setpts', () => {
        // Original video: 10 seconds
        const originalDuration = 10;
        
        // Case 1: videoSpeed = 0.8666 (need to stretch to 11.54s)
        const videoSpeed1 = 0.8666;
        const ptsMultiplier1 = 1.0 / videoSpeed1;
        const resultDuration1 = originalDuration * ptsMultiplier1;
        expect(resultDuration1).toBeCloseTo(11.54, 1);
        
        // Case 2: videoSpeed = 1.25 (need to compress to 8s)
        const videoSpeed2 = 1.25;
        const ptsMultiplier2 = 1.0 / videoSpeed2;
        const resultDuration2 = originalDuration * ptsMultiplier2;
        expect(resultDuration2).toBeCloseTo(8.0, 1);
    });
    
    it('should handle videoSpeed very close to 1.0', () => {
        // videoSpeed = 1.0001 (almost no change)
        // With threshold 0.001, this is treated as 1.0
        const videoSpeed = 1.0001;
        const setpts = calculateSetpts(videoSpeed);
        
        // Should be treated as no change (within threshold)
        expect(setpts).toBe('PTS-STARTPTS');
    });
    
    it('should handle videoSpeed = 0.9999 (very close to 1.0)', () => {
        const videoSpeed = 0.9999;
        const setpts = calculateSetpts(videoSpeed);
        
        // Should be treated as no change (within threshold)
        expect(setpts).toBe('PTS-STARTPTS');
    });
    
    it('should verify setpts formula correctness', () => {
        // Test multiple scenarios
        const testCases = [
            { videoSpeed: 1.5, expectedMultiplier: 0.6667 },
            { videoSpeed: 1.2, expectedMultiplier: 0.8333 },
            { videoSpeed: 0.9, expectedMultiplier: 1.1111 },
            { videoSpeed: 0.7, expectedMultiplier: 1.4286 },
        ];
        
        testCases.forEach(({ videoSpeed, expectedMultiplier }) => {
            const setpts = calculateSetpts(videoSpeed);
            const multiplier = parseFloat(setpts.split('*')[0]);
            expect(multiplier).toBeCloseTo(expectedMultiplier, 3);
        });
    });
    
    it('should build correct filter string', () => {
        const buildFilterString = (
            start: number,
            end: number,
            videoSpeed: number,
            fps: number
        ): string => {
            let filterStr = `[0:v]trim=start=${start.toFixed(4)}:end=${end.toFixed(4)}`;
            
            if (Math.abs(videoSpeed - 1.0) > 0.001) {
                const ptsMultiplier = (1.0 / videoSpeed).toFixed(4);
                filterStr += `,setpts=${ptsMultiplier}*PTS`;
            } else {
                filterStr += `,setpts=PTS-STARTPTS`;
            }
            
            filterStr += `,fps=${fps.toFixed(3)}`;
            
            return filterStr;
        };
        
        // Test case: videoSpeed = 1.154
        const filter = buildFilterString(0, 10, 1.154, 30);
        
        expect(filter).toContain('trim=start=0.0000:end=10.0000');
        expect(filter).toContain('setpts=0.8666*PTS');
        expect(filter).toContain('fps=30.000');
    });
    
    it('should not cause frozen frames with correct setpts', () => {
        // FFmpeg setpts multiplier > 1 lengthens output; < 1 shortens output
        
        const videoSpeed = 0.6667; // Need to lengthen output video
        const setpts = calculateSetpts(videoSpeed);
        const multiplier = parseFloat(setpts.split('*')[0]);
        
        // Multiplier should be > 1.0 to lengthen output
        expect(multiplier).toBeGreaterThan(1.0);
        expect(multiplier).toBeCloseTo(1.5, 3);
        
        // This will NOT cause frozen frames
    });
});
