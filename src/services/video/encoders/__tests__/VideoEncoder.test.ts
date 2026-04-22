import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoEncoder } from '../VideoEncoder';
import { EncodeOptions, EncodeResult } from '../../types';

// Mock implementation for testing the interface
class MockGPUEncoder implements VideoEncoder {
  readonly name = 'h264_nvenc';
  readonly type = 'gpu' as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async encodeSegment(
    inputVideo: string,
    outputPath: string,
    options: EncodeOptions
  ): Promise<EncodeResult> {
    return {
      success: true,
      outputPath,
      fileSize: 1024000,
      duration: options.duration
    };
  }

  getEncoderArgs(options: EncodeOptions): string[] {
    return [
      '-c:v', 'h264_nvenc',
      '-preset', 'p4',
      '-cq', options.crf.toString(),
      '-r', options.fps.toString()
    ];
  }
}

class MockCPUEncoder implements VideoEncoder {
  readonly name = 'libx264';
  readonly type = 'cpu' as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async encodeSegment(
    inputVideo: string,
    outputPath: string,
    options: EncodeOptions
  ): Promise<EncodeResult> {
    return {
      success: true,
      outputPath,
      fileSize: 2048000,
      duration: options.duration
    };
  }

  getEncoderArgs(options: EncodeOptions): string[] {
    return [
      '-c:v', 'libx264',
      '-crf', options.crf.toString(),
      '-preset', options.preset,
      '-r', options.fps.toString()
    ];
  }
}

class MockFailingEncoder implements VideoEncoder {
  readonly name = 'failing_encoder';
  readonly type = 'cpu' as const;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async encodeSegment(
    inputVideo: string,
    outputPath: string,
    options: EncodeOptions
  ): Promise<EncodeResult> {
    return {
      success: false,
      outputPath: '',
      fileSize: 0,
      duration: 0,
      error: 'Encoder not available'
    };
  }

  getEncoderArgs(options: EncodeOptions): string[] {
    return [];
  }
}

describe('VideoEncoder Interface', () => {
  describe('GPU Encoder Implementation', () => {
    let encoder: VideoEncoder;

    beforeEach(() => {
      encoder = new MockGPUEncoder();
    });

    it('should have correct name and type', () => {
      expect(encoder.name).toBe('h264_nvenc');
      expect(encoder.type).toBe('gpu');
    });

    it('should check availability', async () => {
      const available = await encoder.isAvailable();
      expect(available).toBe(true);
    });

    it('should encode segment successfully', async () => {
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'medium'
      };

      const result = await encoder.encodeSegment(
        '/input/video.mp4',
        '/output/segment.mp4',
        options
      );

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/output/segment.mp4');
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.duration).toBe(10);
      expect(result.error).toBeUndefined();
    });

    it('should generate correct encoder arguments', () => {
      const options: EncodeOptions = {
        startTime: 5,
        duration: 3.5,
        videoSpeed: 0.8,
        fps: 30,
        crf: 20,
        preset: 'fast'
      };

      const args = encoder.getEncoderArgs(options);

      expect(args).toContain('-c:v');
      expect(args).toContain('h264_nvenc');
      expect(args).toContain('-cq');
      expect(args).toContain('20');
      expect(args).toContain('-r');
      expect(args).toContain('30');
    });

    it('should handle slow motion encoding', async () => {
      const options: EncodeOptions = {
        startTime: 0,
        duration: 5,
        videoSpeed: 0.75,
        fps: 30,
        crf: 18,
        preset: 'slow'
      };

      const result = await encoder.encodeSegment(
        '/input/video.mp4',
        '/output/slow.mp4',
        options
      );

      expect(result.success).toBe(true);
      expect(result.duration).toBe(5);
    });
  });

  describe('CPU Encoder Implementation', () => {
    let encoder: VideoEncoder;

    beforeEach(() => {
      encoder = new MockCPUEncoder();
    });

    it('should have correct name and type', () => {
      expect(encoder.name).toBe('libx264');
      expect(encoder.type).toBe('cpu');
    });

    it('should check availability', async () => {
      const available = await encoder.isAvailable();
      expect(available).toBe(true);
    });

    it('should encode segment successfully', async () => {
      const options: EncodeOptions = {
        startTime: 2.5,
        duration: 7.3,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'medium'
      };

      const result = await encoder.encodeSegment(
        '/input/video.mp4',
        '/output/segment.mp4',
        options
      );

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/output/segment.mp4');
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.duration).toBe(7.3);
    });

    it('should generate correct encoder arguments', () => {
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'medium'
      };

      const args = encoder.getEncoderArgs(options);

      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-crf');
      expect(args).toContain('22');
      expect(args).toContain('-preset');
      expect(args).toContain('medium');
      expect(args).toContain('-r');
      expect(args).toContain('30');
    });

    it('should support different presets', () => {
      const presets = ['ultrafast', 'fast', 'medium', 'slow', 'veryslow'];

      presets.forEach(preset => {
        const options: EncodeOptions = {
          startTime: 0,
          duration: 10,
          videoSpeed: 1.0,
          fps: 30,
          crf: 22,
          preset
        };

        const args = encoder.getEncoderArgs(options);
        expect(args).toContain('-preset');
        expect(args).toContain(preset);
      });
    });
  });

  describe('Failing Encoder Implementation', () => {
    let encoder: VideoEncoder;

    beforeEach(() => {
      encoder = new MockFailingEncoder();
    });

    it('should report unavailable', async () => {
      const available = await encoder.isAvailable();
      expect(available).toBe(false);
    });

    it('should return failed result when encoding', async () => {
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'medium'
      };

      const result = await encoder.encodeSegment(
        '/input/video.mp4',
        '/output/segment.mp4',
        options
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.fileSize).toBe(0);
    });

    it('should return empty encoder args', () => {
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'medium'
      };

      const args = encoder.getEncoderArgs(options);
      expect(args).toEqual([]);
    });
  });

  describe('Encoder Comparison', () => {
    it('should differentiate between GPU and CPU encoders', () => {
      const gpuEncoder = new MockGPUEncoder();
      const cpuEncoder = new MockCPUEncoder();

      expect(gpuEncoder.type).toBe('gpu');
      expect(cpuEncoder.type).toBe('cpu');
      expect(gpuEncoder.name).not.toBe(cpuEncoder.name);
    });

    it('should generate different arguments for GPU vs CPU', () => {
      const gpuEncoder = new MockGPUEncoder();
      const cpuEncoder = new MockCPUEncoder();

      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'medium'
      };

      const gpuArgs = gpuEncoder.getEncoderArgs(options);
      const cpuArgs = cpuEncoder.getEncoderArgs(options);

      expect(gpuArgs).toContain('h264_nvenc');
      expect(cpuArgs).toContain('libx264');
      expect(gpuArgs).not.toEqual(cpuArgs);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short segments', async () => {
      const encoder = new MockCPUEncoder();
      const options: EncodeOptions = {
        startTime: 0,
        duration: 0.1,
        videoSpeed: 1.0,
        fps: 30,
        crf: 22,
        preset: 'ultrafast'
      };

      const result = await encoder.encodeSegment(
        '/input/video.mp4',
        '/output/short.mp4',
        options
      );

      expect(result.success).toBe(true);
      expect(result.duration).toBe(0.1);
    });

    it('should handle high CRF values', () => {
      const encoder = new MockCPUEncoder();
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 51,
        preset: 'ultrafast'
      };

      const args = encoder.getEncoderArgs(options);
      expect(args).toContain('51');
    });

    it('should handle low CRF values', () => {
      const encoder = new MockCPUEncoder();
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 0,
        preset: 'veryslow'
      };

      const args = encoder.getEncoderArgs(options);
      expect(args).toContain('0');
    });

    it('should handle different frame rates', () => {
      const encoder = new MockGPUEncoder();
      const frameRates = [24, 25, 30, 50, 60];

      frameRates.forEach(fps => {
        const options: EncodeOptions = {
          startTime: 0,
          duration: 10,
          videoSpeed: 1.0,
          fps,
          crf: 22,
          preset: 'medium'
        };

        const args = encoder.getEncoderArgs(options);
        expect(args).toContain(fps.toString());
      });
    });
  });
});
