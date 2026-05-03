import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EncodeOptions } from '../../../../src/services/video/types';

vi.mock(import('child_process'), async (importOriginal) => ({
  ...(await importOriginal()),
}));

vi.mock(import('fs/promises'), async (importOriginal) => ({
  ...(await importOriginal()),
  stat: vi.fn(),
}));

const { CPUEncoder } = await import('../../../../src/services/video/encoders/CPUEncoder');

describe('CPUEncoder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create CPU encoder', () => {
      const encoder = new CPUEncoder();
      expect(encoder.name).toBe('libx264');
      expect(encoder.type).toBe('cpu');
    });
  });

  describe('isAvailable', () => {
    it('should always return true', async () => {
      const encoder = new CPUEncoder();
      const available = await encoder.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('encodeSegment', () => {
    const mockOptions: EncodeOptions = {
      startTime: 10.5,
      duration: 5.2,
      videoSpeed: 1.0,
      fps: 30,
      crf: 23,
      preset: 'fast'
    };

    it('should encode segment successfully', async () => {
      const encoder = new CPUEncoder();
      const fsPromises = await import('fs/promises');
      const mockStat = vi.mocked(fsPromises.stat);
      mockStat.mockResolvedValue({ size: 1024000 } as any);

      const result = await encoder.encodeSegment(
        'input.mp4',
        'output.mp4',
        mockOptions
      );

      expect(result).toBeDefined();
    });
  });

  describe('getEncoderArgs', () => {
    it('should generate CPU encoder args', () => {
      const encoder = new CPUEncoder();
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 23,
        preset: 'fast'
      };

      const args = encoder.getEncoderArgs(options);

      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-preset');
      expect(args).toContain('fast');
      expect(args).toContain('-crf');
      expect(args).toContain('23');
      expect(args).toContain('-r');
      expect(args).toContain('30');
    });

    it('should include setpts filter for video speed', () => {
      const encoder = new CPUEncoder();
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 0.5,
        fps: 30,
        crf: 23,
        preset: 'fast'
      };

      const args = encoder.getEncoderArgs(options);

      expect(args).toContain('-vf');
      const vfIndex = args.indexOf('-vf');
      expect(args[vfIndex + 1]).toBe('setpts=2.000000*PTS');
    });

    it('should not include filter when speed is 1.0', () => {
      const encoder = new CPUEncoder();
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 23,
        preset: 'fast'
      };

      const args = encoder.getEncoderArgs(options);

      expect(args).not.toContain('-vf');
    });

    it('should support different presets', () => {
      const encoder = new CPUEncoder();
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 18,
        preset: 'slow'
      };

      const args = encoder.getEncoderArgs(options);

      expect(args).toContain('-preset');
      expect(args).toContain('slow');
      expect(args).toContain('-crf');
      expect(args).toContain('18');
    });
  });
});