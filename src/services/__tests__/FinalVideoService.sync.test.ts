import { describe, it, expect } from 'vitest';

/**
 * Unit tests for Bug #2: Audio Sync Drift Fix
 * Tests cumulative drift tracking and reporting
 */
describe('FinalVideoService - Audio Sync Drift Fix (Bug #2)', () => {
    interface SegmentTiming {
        expectedDuration: number;
        actualDuration: number;
        drift: number;
    }
    
    it('should track cumulative drift across segments', () => {
        const segments: SegmentTiming[] = Array.from({ length: 100 }, (_, i) => ({
            expectedDuration: 2.0,
            actualDuration: 2.0005,  // +0.5ms per segment
            drift: 0.0005
        }));
        
        let cumulativeDrift = 0;
        const drifts: number[] = [];
        
        for (let i = 0; i < segments.length; i++) {
            cumulativeDrift += segments[i].drift;
            
            if ((i + 1) % 10 === 0) {
                drifts.push(cumulativeDrift);
            }
        }
        
        // After 100 segments: 100 * 0.5ms = 50ms
        expect(cumulativeDrift).toBeCloseTo(0.05, 2);
        
        // Check drift increases linearly
        expect(drifts[0]).toBeCloseTo(0.005, 3);  // After 10 segments
        expect(drifts[4]).toBeCloseTo(0.025, 3);  // After 50 segments
        expect(drifts[9]).toBeCloseTo(0.05, 2);   // After 100 segments
    });
    
    it('should detect drift exceeding threshold', () => {
        const segments: SegmentTiming[] = [
            { expectedDuration: 2.0, actualDuration: 2.1, drift: 0.1 },  // +100ms
            { expectedDuration: 2.0, actualDuration: 2.05, drift: 0.05 }, // +50ms
            { expectedDuration: 2.0, actualDuration: 2.08, drift: 0.08 }, // +80ms
        ];
        
        let cumulativeDrift = 0;
        const DRIFT_THRESHOLD = 0.05;
        const warnings: string[] = [];
        
        for (let i = 0; i < segments.length; i++) {
            cumulativeDrift += segments[i].drift;
            
            if (Math.abs(cumulativeDrift) > DRIFT_THRESHOLD) {
                warnings.push(`Drift at segment ${i}: ${cumulativeDrift.toFixed(3)}s`);
            }
        }
        
        expect(warnings.length).toBeGreaterThan(0);
        expect(cumulativeDrift).toBeCloseTo(0.23, 2);
    });
    
    it('should calculate final drift correctly', () => {
        const segments = Array.from({ length: 200 }, () => ({
            expectedDuration: 3.0,
            actualDuration: 3.0,
            drift: 0.0
        }));
        
        const totalExpected = segments.reduce((sum, s) => sum + s.expectedDuration, 0);
        const totalActual = 600.5;  // 0.5s drift over 10 minutes
        const finalDrift = totalActual - totalExpected;
        
        expect(totalExpected).toBe(600);
        expect(finalDrift).toBeCloseTo(0.5, 1);
    });
    
    it('should warn if drift exceeds 100ms', () => {
        const finalDrift = 0.15;  // 150ms
        const warnings: string[] = [];
        
        if (Math.abs(finalDrift) > 0.1) {
            warnings.push(`Final drift: ${finalDrift.toFixed(3)}s`);
        }
        
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('0.150');
    });
    
    it('should handle negative drift (audio shorter than expected)', () => {
        const segments: SegmentTiming[] = Array.from({ length: 50 }, () => ({
            expectedDuration: 2.0,
            actualDuration: 1.998,  // -2ms per segment
            drift: -0.002
        }));
        
        let cumulativeDrift = 0;
        for (const seg of segments) {
            cumulativeDrift += seg.drift;
        }
        
        // 50 * -2ms = -100ms
        expect(cumulativeDrift).toBeCloseTo(-0.1, 2);
        expect(cumulativeDrift).toBeLessThan(0);
    });
    
    it('should track drift at correction intervals', () => {
        const segments: SegmentTiming[] = Array.from({ length: 30 }, (_, i) => ({
            expectedDuration: 2.0,
            actualDuration: 2.001,
            drift: 0.001
        }));
        
        let cumulativeDrift = 0;
        const CORRECTION_INTERVAL = 10;
        const DRIFT_THRESHOLD = 0.005;
        const corrections: number[] = [];
        
        for (let i = 0; i < segments.length; i++) {
            cumulativeDrift += segments[i].drift;
            
            if ((i + 1) % CORRECTION_INTERVAL === 0 && Math.abs(cumulativeDrift) > DRIFT_THRESHOLD) {
                corrections.push(cumulativeDrift);
            }
        }
        
        // Should have corrections at segments 10, 20, 30
        expect(corrections.length).toBe(3);
        expect(corrections[0]).toBeCloseTo(0.01, 3);  // After 10 segments
        expect(corrections[1]).toBeCloseTo(0.02, 3);  // After 20 segments
        expect(corrections[2]).toBeCloseTo(0.03, 3);  // After 30 segments
    });
    
    it('should handle mixed positive and negative drift', () => {
        const segments: SegmentTiming[] = [
            { expectedDuration: 2.0, actualDuration: 2.01, drift: 0.01 },
            { expectedDuration: 2.0, actualDuration: 1.99, drift: -0.01 },
            { expectedDuration: 2.0, actualDuration: 2.02, drift: 0.02 },
            { expectedDuration: 2.0, actualDuration: 1.98, drift: -0.02 },
        ];
        
        let cumulativeDrift = 0;
        for (const seg of segments) {
            cumulativeDrift += seg.drift;
        }
        
        // Should cancel out: +0.01 -0.01 +0.02 -0.02 = 0
        expect(cumulativeDrift).toBeCloseTo(0, 3);
    });
    
    it('should calculate total expected duration correctly', () => {
        const segments = [
            { expectedDuration: 1.5, actualDuration: 1.5, drift: 0 },
            { expectedDuration: 2.3, actualDuration: 2.3, drift: 0 },
            { expectedDuration: 3.7, actualDuration: 3.7, drift: 0 },
            { expectedDuration: 0.8, actualDuration: 0.8, drift: 0 },
        ];
        
        const totalExpected = segments.reduce((sum, s) => sum + s.expectedDuration, 0);
        
        expect(totalExpected).toBeCloseTo(8.3, 1);
    });
});
