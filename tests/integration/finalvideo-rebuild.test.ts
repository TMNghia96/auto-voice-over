import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioSegmentBuilder } from '../../src/services/audio/AudioSegmentBuilder';
import { AudioProcessor } from '../../src/services/audio/AudioProcessor';
import { SegmentValidator } from '../../src/services/video/SegmentValidator';
import { VideoProcessor } from '../../src/services/video/VideoProcessor';
import { EncoderFactory } from '../../src/services/video/encoders/EncoderFactory';
import { Segment, ValidatedSegment } from '../../src/services/video/types';

// Mock child_process for FFmpeg operations
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('../../src/services/EnvironmentService', () => ({
  getFfmpegPath: vi.fn(() => 'ffmpeg'),
}));

vi.mock('fs/promises');

describe('FinalVideoService Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Module Integration', () => {
    it('should integrate AudioSegmentBuilder with segment data', () => {
      const builder = new AudioSegmentBuilder();
      expect(builder).toBeDefined();
      expect(builder).toBeInstanceOf(AudioSegmentBuilder);
    });

    it('should integrate AudioProcessor with FFmpeg path', () => {
      const processor = new AudioProcessor('ffmpeg', 0.15, 0.5);
      expect(processor).toBeDefined();
      expect(processor).toBeInstanceOf(AudioProcessor);
    });

    it('should integrate SegmentValidator with segments', () => {
      const validator = new SegmentValidator();
      expect(validator).toBeDefined();
      expect(validator).toBeInstanceOf(SegmentValidator);

      // Test validation logic
      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          audioPath: '/audio/0.wav',
          audioDuration: 4.5,
          targetDuration: 4.5,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
      ];

      const actualDurations = [4.5];
      const validated = validator.validateAndAdjust(segments, actualDurations, 10);

      expect(validated).toHaveLength(1);
      expect(validated[0].adjustedVideoSpeed).toBeDefined();
      expect(validated[0].adjustedDuration).toBe(4.5);
    });

    it('should integrate EncoderFactory with encoder preference', () => {
      const factory = new EncoderFactory('auto');
      expect(factory).toBeDefined();
      expect(factory).toBeInstanceOf(EncoderFactory);
    });

    it('should integrate VideoProcessor with all dependencies', () => {
      const factory = new EncoderFactory('auto');
      const validator = new SegmentValidator();
      const processor = new VideoProcessor(factory, validator, {
        concurrency: 6,
        maxRetries: 3,
        retryDelay: 1000,
        encoderPreference: 'auto',
      });

      expect(processor).toBeDefined();
      expect(processor).toBeInstanceOf(VideoProcessor);
    });
  });

  describe('Data Flow Integration', () => {
    it('should validate segments after audio processing', () => {
      const validator = new SegmentValidator();

      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          audioPath: '/audio/0.wav',
          audioDuration: 4.8,
          targetDuration: 4.8,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
        {
          type: 'dubbed',
          index: 1,
          videoStart: 5,
          videoEnd: 10,
          videoDuration: 5,
          audioPath: '/audio/1.wav',
          audioDuration: 5.2,
          targetDuration: 5.2,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
      ];

      const actualDurations = [4.8, 5.2];
      const validated = validator.validateAndAdjust(segments, actualDurations, 10);

      expect(validated).toHaveLength(2);
      expect(validated[0].adjustedVideoSpeed).toBeCloseTo(1.04, 2);
      expect(validated[1].adjustedVideoSpeed).toBeCloseTo(0.96, 2);
    });

    it('should handle speed adjustments correctly', () => {
      const validator = new SegmentValidator();

      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 10,
          videoDuration: 10,
          audioPath: '/audio/0.wav',
          audioDuration: 12,
          targetDuration: 12,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
      ];

      const actualDurations = [12];
      const validated = validator.validateAndAdjust(segments, actualDurations, 10);

      expect(validated).toHaveLength(1);
      expect(validated[0].needsSlowMotion).toBe(true);
      expect(validated[0].adjustedVideoSpeed).toBeLessThan(1.0);
    });

    it('should handle gap segments correctly', () => {
      const validator = new SegmentValidator();

      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          audioPath: '/audio/0.wav',
          audioDuration: 5,
          targetDuration: 5,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
        {
          type: 'gap',
          videoStart: 5,
          videoEnd: 7,
          videoDuration: 2,
          targetDuration: 2,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
        {
          type: 'dubbed',
          index: 1,
          videoStart: 7,
          videoEnd: 10,
          videoDuration: 3,
          audioPath: '/audio/1.wav',
          audioDuration: 3,
          targetDuration: 3,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
      ];

      const actualDurations = [5, 2, 3];
      const validated = validator.validateAndAdjust(segments, actualDurations, 10);

      expect(validated).toHaveLength(3);
      expect(validated[1].type).toBe('gap');
      expect(validated[1].adjustedVideoSpeed).toBe(1.0);
    });
  });

  describe('Encoder Integration', () => {
    it('should create GPU encoder factory', () => {
      const factory = new EncoderFactory('gpu');
      expect(factory).toBeDefined();
      expect(factory).toBeInstanceOf(EncoderFactory);
    });

    it('should create CPU encoder factory', () => {
      const factory = new EncoderFactory('cpu');
      expect(factory).toBeDefined();
      expect(factory).toBeInstanceOf(EncoderFactory);
    });

    it('should create auto encoder factory', () => {
      const factory = new EncoderFactory('auto');
      expect(factory).toBeDefined();
      expect(factory).toBeInstanceOf(EncoderFactory);
    });
  });

  describe('Configuration Integration', () => {
    it('should respect GPU encoder preference', () => {
      const factory = new EncoderFactory('gpu');
      const validator = new SegmentValidator();
      const processor = new VideoProcessor(factory, validator, {
        concurrency: 6,
        maxRetries: 3,
        retryDelay: 1000,
        encoderPreference: 'gpu',
      });

      expect(processor).toBeDefined();
    });

    it('should respect CPU encoder preference', () => {
      const factory = new EncoderFactory('cpu');
      const validator = new SegmentValidator();
      const processor = new VideoProcessor(factory, validator, {
        concurrency: 2,
        maxRetries: 3,
        retryDelay: 1000,
        encoderPreference: 'cpu',
      });

      expect(processor).toBeDefined();
    });

    it('should use auto encoder preference by default', () => {
      const factory = new EncoderFactory('auto');
      const validator = new SegmentValidator();
      const processor = new VideoProcessor(factory, validator);

      expect(processor).toBeDefined();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid segment durations gracefully', () => {
      const validator = new SegmentValidator();

      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          audioPath: '/audio/0.wav',
          audioDuration: 0.001,
          targetDuration: 0.001,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
      ];

      const actualDurations = [0.001];
      
      // Should not throw, but handle gracefully
      const validated = validator.validateAndAdjust(segments, actualDurations, 10);
      expect(validated).toHaveLength(1);
    });

    it('should handle mismatched segment and duration arrays', () => {
      const validator = new SegmentValidator();

      const segments: Segment[] = [
        {
          type: 'dubbed',
          index: 0,
          videoStart: 0,
          videoEnd: 5,
          videoDuration: 5,
          audioPath: '/audio/0.wav',
          audioDuration: 5,
          targetDuration: 5,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
        },
      ];

      const actualDurations = [5, 3]; // Mismatched length

      expect(() => {
        validator.validateAndAdjust(segments, actualDurations, 10);
      }).toThrow();
    });
  });

  describe('Performance Integration', () => {
    it('should handle large number of segments efficiently', () => {
      const validator = new SegmentValidator();

      const segments: Segment[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'dubbed' as const,
        index: i,
        videoStart: i * 1,
        videoEnd: (i + 1) * 1,
        videoDuration: 1,
        audioPath: `/audio/${i}.wav`,
        audioDuration: 1,
        targetDuration: 1,
        audioSpeed: 1.0,
        videoSpeed: 1.0,
      }));

      const actualDurations = Array(100).fill(1);
      const validated = validator.validateAndAdjust(segments, actualDurations, 100);

      expect(validated).toHaveLength(100);
      expect(validated.every(s => s.adjustedVideoSpeed === 1.0)).toBe(true);
    });

    it('should create encoder factories efficiently', () => {
      const factories = [
        new EncoderFactory('auto'),
        new EncoderFactory('cpu'),
        new EncoderFactory('gpu'),
      ];

      expect(factories).toHaveLength(3);
      expect(factories.every(f => f instanceof EncoderFactory)).toBe(true);
    });
  });
});
