import { describe, it, expect } from 'vitest';
import { 
  EncodeOptions, 
  EncodeResult, 
  ValidatedSegment, 
  VideoProcessorConfig,
  DEFAULT_VIDEO_CONFIG 
} from '../types';

describe('Video Types', () => {
  describe('EncodeOptions', () => {
    it('should have all required properties', () => {
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'medium'
      };

      expect(options.startTime).toBe(0);
      expect(options.duration).toBe(10);
      expect(options.videoSpeed).toBe(1.0);
      expect(options.fps).toBe(30);
      expect(options.crf).toBe(22);
      expect(options.preset).toBe('medium');
    });

    it('should support slow motion video speed', () => {
      const options: EncodeOptions = {
        startTime: 5.5,
        duration: 3.2,
        videoSpeed: 0.75,
        fps: 30,
        crf: 18,
        preset: 'fast'
      };

      expect(options.videoSpeed).toBeLessThan(1.0);
    });

    it('should support different CRF values', () => {
      const lowQuality: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 28,
        preset: 'fast'
      };

      const highQuality: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 18,
        preset: 'slow'
      };

      expect(lowQuality.crf).toBeGreaterThan(highQuality.crf);
    });
  });

  describe('EncodeResult', () => {
    it('should represent successful encoding', () => {
      const result: EncodeResult = {
        success: true,
        outputPath: '/path/to/output.mp4',
        fileSize: 1024000,
        duration: 10.5
      };

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/path/to/output.mp4');
      expect(result.fileSize).toBe(1024000);
      expect(result.duration).toBe(10.5);
      expect(result.error).toBeUndefined();
    });

    it('should represent failed encoding with error', () => {
      const result: EncodeResult = {
        success: false,
        outputPath: '',
        fileSize: 0,
        duration: 0,
        error: 'FFmpeg encoding failed'
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('FFmpeg encoding failed');
    });

    it('should handle zero-byte files', () => {
      const result: EncodeResult = {
        success: false,
        outputPath: '/path/to/output.mp4',
        fileSize: 0,
        duration: 0,
        error: 'Output file is empty'
      };

      expect(result.fileSize).toBe(0);
      expect(result.success).toBe(false);
    });
  });

  describe('ValidatedSegment', () => {
    it('should extend base segment with validation fields', () => {
      const segment: ValidatedSegment = {
        type: 'dubbed',
        index: 1,
        videoStart: 0,
        videoEnd: 5,
        videoDuration: 5,
        audioPath: '/path/to/audio.mp3',
        audioDuration: 6.5,
        targetDuration: 6.5,
        audioSpeed: 1.0,
        videoSpeed: 0.769,
        adjustedVideoSpeed: 0.769,
        adjustedDuration: 6.5,
        needsSlowMotion: true
      };

      expect(segment.type).toBe('dubbed');
      expect(segment.adjustedVideoSpeed).toBe(0.769);
      expect(segment.adjustedDuration).toBe(6.5);
      expect(segment.needsSlowMotion).toBe(true);
    });

    it('should handle gap segments without slow motion', () => {
      const segment: ValidatedSegment = {
        type: 'gap',
        videoStart: 5,
        videoEnd: 7,
        videoDuration: 2,
        targetDuration: 2,
        audioSpeed: 1.0,
        videoSpeed: 1.0,
        fadeStart: true,
        fadeEnd: true,
        adjustedVideoSpeed: 1.0,
        adjustedDuration: 2,
        needsSlowMotion: false
      };

      expect(segment.type).toBe('gap');
      expect(segment.needsSlowMotion).toBe(false);
      expect(segment.fadeStart).toBe(true);
      expect(segment.fadeEnd).toBe(true);
    });

    it('should detect slow motion requirement', () => {
      const normalSpeed: ValidatedSegment = {
        type: 'dubbed',
        index: 1,
        videoStart: 0,
        videoEnd: 5,
        videoDuration: 5,
        targetDuration: 5,
        audioSpeed: 1.0,
        videoSpeed: 1.0,
        adjustedVideoSpeed: 1.0,
        adjustedDuration: 5,
        needsSlowMotion: false
      };

      const slowMotion: ValidatedSegment = {
        type: 'dubbed',
        index: 2,
        videoStart: 5,
        videoEnd: 10,
        videoDuration: 5,
        targetDuration: 7,
        audioSpeed: 1.4,
        videoSpeed: 0.714,
        adjustedVideoSpeed: 0.714,
        adjustedDuration: 7,
        needsSlowMotion: true
      };

      expect(normalSpeed.needsSlowMotion).toBe(false);
      expect(slowMotion.needsSlowMotion).toBe(true);
      expect(slowMotion.videoSpeed).toBeLessThan(1.0);
    });
  });

  describe('VideoProcessorConfig', () => {
    it('should have all required configuration fields', () => {
      const config: VideoProcessorConfig = {
        concurrency: 4,
        maxRetries: 3,
        retryDelay: 1000,
        encoderPreference: 'gpu'
      };

      expect(config.concurrency).toBe(4);
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelay).toBe(1000);
      expect(config.encoderPreference).toBe('gpu');
    });

    it('should support all encoder preferences', () => {
      const gpuConfig: VideoProcessorConfig = {
        concurrency: 6,
        maxRetries: 3,
        retryDelay: 1000,
        encoderPreference: 'gpu'
      };

      const cpuConfig: VideoProcessorConfig = {
        concurrency: 4,
        maxRetries: 3,
        retryDelay: 1000,
        encoderPreference: 'cpu'
      };

      const autoConfig: VideoProcessorConfig = {
        concurrency: 6,
        maxRetries: 3,
        retryDelay: 1000,
        encoderPreference: 'auto'
      };

      expect(gpuConfig.encoderPreference).toBe('gpu');
      expect(cpuConfig.encoderPreference).toBe('cpu');
      expect(autoConfig.encoderPreference).toBe('auto');
    });

    it('should allow custom retry configuration', () => {
      const aggressiveRetry: VideoProcessorConfig = {
        concurrency: 2,
        maxRetries: 5,
        retryDelay: 500,
        encoderPreference: 'auto'
      };

      const conservativeRetry: VideoProcessorConfig = {
        concurrency: 8,
        maxRetries: 1,
        retryDelay: 2000,
        encoderPreference: 'gpu'
      };

      expect(aggressiveRetry.maxRetries).toBe(5);
      expect(aggressiveRetry.retryDelay).toBe(500);
      expect(conservativeRetry.maxRetries).toBe(1);
      expect(conservativeRetry.retryDelay).toBe(2000);
    });
  });

  describe('DEFAULT_VIDEO_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_VIDEO_CONFIG.concurrency).toBe(6);
      expect(DEFAULT_VIDEO_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_VIDEO_CONFIG.retryDelay).toBe(1000);
      expect(DEFAULT_VIDEO_CONFIG.encoderPreference).toBe('auto');
    });

    it('should be immutable reference', () => {
      const config = DEFAULT_VIDEO_CONFIG;
      expect(config).toBe(DEFAULT_VIDEO_CONFIG);
    });

    it('should allow creating custom configs from defaults', () => {
      const customConfig: VideoProcessorConfig = {
        ...DEFAULT_VIDEO_CONFIG,
        concurrency: 8,
        encoderPreference: 'gpu'
      };

      expect(customConfig.concurrency).toBe(8);
      expect(customConfig.encoderPreference).toBe('gpu');
      expect(customConfig.maxRetries).toBe(DEFAULT_VIDEO_CONFIG.maxRetries);
      expect(customConfig.retryDelay).toBe(DEFAULT_VIDEO_CONFIG.retryDelay);
    });
  });
});
