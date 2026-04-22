import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SegmentValidator } from '../../../src/services/video/SegmentValidator';
import { Segment, ValidatedSegment } from '../../../src/services/video/types';

describe('SegmentValidator', () => {
  let validator: SegmentValidator;

  beforeEach(() => {
    validator = new SegmentValidator();
    vi.clearAllMocks();
  });

  describe('validateAndAdjust', () => {
    it('should calculate adjusted video speed based on actual audio duration', () => {
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          targetDuration: 4,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [4.0]; // Actual audio is 4 seconds
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result).toHaveLength(1);
      expect(result[0].adjustedVideoSpeed).toBe(1.25); // 5 / 4 = 1.25
      expect(result[0].adjustedDuration).toBe(4.0);
      expect(result[0].needsSlowMotion).toBe(false);
    });

    it('should mark segment as needing slow motion when speed < 1.0', () => {
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 3,
          videoDuration: 3,
          targetDuration: 5,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [5.0]; // Audio is longer than video
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result[0].adjustedVideoSpeed).toBe(0.6); // 3 / 5 = 0.6
      expect(result[0].needsSlowMotion).toBe(true);
    });

    it('should warn when adjusted speed is below 0.5', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 2,
          videoDuration: 2,
          targetDuration: 5,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [5.0];
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result[0].adjustedVideoSpeed).toBe(0.4); // 2 / 5 = 0.4
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Segment 0: adjusted speed 0.40 is below minimum 0.5')
      );
    });

    it('should warn when adjusted speed is above 2.0', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 10,
          videoDuration: 10,
          targetDuration: 4,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [4.0];
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result[0].adjustedVideoSpeed).toBe(2.5); // 10 / 4 = 2.5
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Segment 0: adjusted speed 2.50 is above maximum 2.')
      );
    });

    it('should handle segments beyond video duration', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 150, // Beyond video duration
          videoEnd: 155,
          videoDuration: 5,
          targetDuration: 5,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [5.0];
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result[0].adjustedVideoSpeed).toBe(1.0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Segment 0: videoStart 150 is beyond video duration 100')
      );
    });

    it('should handle multiple segments correctly', () => {
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          targetDuration: 4,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        },
        {
          type: 'gap',
          videoStart: 5,
          videoEnd: 8,
          videoDuration: 3,
          targetDuration: 3,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        },
        {
          type: 'dubbed',
          index: 1,
          videoStart: 8,
          videoEnd: 12,
          videoDuration: 4,
          targetDuration: 6,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [4.0, 3.0, 6.0];
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result).toHaveLength(3);
      expect(result[0].adjustedVideoSpeed).toBe(1.25); // 5 / 4
      expect(result[0].needsSlowMotion).toBe(false);
      
      expect(result[1].adjustedVideoSpeed).toBe(1.0); // 3 / 3
      expect(result[1].needsSlowMotion).toBe(false);
      
      expect(result[2].adjustedVideoSpeed).toBe(0.6667); // 4 / 6
      expect(result[2].needsSlowMotion).toBe(true);
    });

    it('should handle edge case where actual audio duration equals video duration', () => {
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          targetDuration: 5,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [5.0];
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result[0].adjustedVideoSpeed).toBe(1.0);
      expect(result[0].adjustedDuration).toBe(5.0);
      expect(result[0].needsSlowMotion).toBe(false);
    });

    it('should throw error if segments and actualAudioDurations length mismatch', () => {
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          targetDuration: 4,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [4.0, 5.0]; // Mismatch
      const videoDuration = 100;

      expect(() => {
        validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);
      }).toThrow('Segments and actualAudioDurations length mismatch');
    });

    it('should preserve all original segment properties', () => {
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          audioPath: '/path/to/audio.wav',
          audioDuration: 4.5,
          targetDuration: 4,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
          fadeStart: true,
          fadeEnd: false
        }
      ];
      const actualAudioDurations = [4.0];
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result[0].type).toBe('dubbed');
      expect(result[0].index).toBe(0);
      expect(result[0].videoStart).toBe(0);
      expect(result[0].videoEnd).toBe(5);
      expect(result[0].videoDuration).toBe(5);
      expect(result[0].audioPath).toBe('/path/to/audio.wav');
      expect(result[0].audioDuration).toBe(4.5);
      expect(result[0].targetDuration).toBe(4);
      expect(result[0].audioSpeed).toBe(1.0);
      expect(result[0].videoSpeed).toBe(1.0);
      expect(result[0].fadeStart).toBe(true);
      expect(result[0].fadeEnd).toBe(false);
    });

    it('should round adjusted video speed to 4 decimal places', () => {
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 7,
          videoDuration: 7,
          targetDuration: 3,
          audioSpeed: 1.0,
          videoSpeed: 1.0
        }
      ];
      const actualAudioDurations = [3.0];
      const videoDuration = 100;

      const result = validator.validateAndAdjust(segments, actualAudioDurations, videoDuration);

      expect(result[0].adjustedVideoSpeed).toBe(2.3333); // 7 / 3 = 2.333...
    });
  });
});
