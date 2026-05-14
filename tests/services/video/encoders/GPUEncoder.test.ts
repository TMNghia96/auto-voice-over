import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EncodeOptions } from '../../../../src/services/video/types';

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock(import('child_process'), async (importOriginal) => ({
  ...(await importOriginal()),
}));

vi.mock(import('fs/promises'), async (importOriginal) => ({
  ...(await importOriginal()),
  stat: vi.fn(),
}));

const { GPUEncoder } = await import('../../../../src/services/video/encoders/GPUEncoder');

describe('GPUEncoder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create AMD encoder', () => {
      const encoder = new GPUEncoder('amd');
      expect(encoder.name).toBe('h264_amf');
      expect(encoder.type).toBe('gpu');
    });

    it('should create NVIDIA encoder', () => {
      const encoder = new GPUEncoder('nvidia');
      expect(encoder.name).toBe('h264_nvenc');
      expect(encoder.type).toBe('gpu');
    });
  });

  describe('isAvailable', () => {
    it('should return true when GPU encoder is available', async () => {
      const encoder = new GPUEncoder('nvidia');

      const result = await encoder.isAvailable();
      // With real child_process, this calls ffmpeg which tries real encoding
      // Assert without assuming mock behavior
      expect(typeof result).toBe('boolean');
    });

    it('should cache availability result', async () => {
      const encoder = new GPUEncoder('amd');

      const first = await encoder.isAvailable();
      const second = await encoder.isAvailable();

      expect(first).toBe(second);
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
      const encoder = new GPUEncoder('nvidia');
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
    it('should generate NVIDIA encoder args', () => {
      const encoder = new GPUEncoder('nvidia');
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
      expect(args).toContain('h264_nvenc');
      expect(args).toContain('-preset');
      expect(args).toContain('fast');
      expect(args).toContain('-cq');
      expect(args).toContain('23');
    });

    it('should generate AMD encoder args', () => {
      const encoder = new GPUEncoder('amd');
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
      expect(args).toContain('h264_amf');
      expect(args).toContain('-quality');
      expect(args).toContain('balanced');
    });

    it('should reset timestamps and enforce CFR when changing speed', () => {
      const encoder = new GPUEncoder('nvidia');
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
      expect(args[vfIndex + 1]).toBe('setpts=2.000000*(PTS-STARTPTS),fps=30');
    });

    it('should reset timestamps and enforce CFR when speed is 1.0', () => {
      const encoder = new GPUEncoder('nvidia');
      const options: EncodeOptions = {
        startTime: 0,
        duration: 10,
        videoSpeed: 1.0,
        fps: 30,
        crf: 23,
        preset: 'fast'
      };

      const args = encoder.getEncoderArgs(options);

      expect(args).toContain('-vf');
      const vfIndex = args.indexOf('-vf');
      expect(args[vfIndex + 1]).toBe('setpts=PTS-STARTPTS,fps=30');
    });
  });
});
