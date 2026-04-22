import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EncodeOptions } from '../../../../src/services/video/types';

// Create mock function that will be used by promisify
const mockExecFileAsync = vi.fn();

// Mock the modules before importing CPUEncoder
vi.mock('child_process', () => ({
  execFile: vi.fn()
}));

vi.mock('fs/promises', () => ({
  stat: vi.fn()
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecFileAsync)
}));

// Import after mocks are set up
const { CPUEncoder } = await import('../../../../src/services/video/encoders/CPUEncoder');
const { stat } = await import('fs/promises');

describe('CPUEncoder', () => {
  const mockStat = vi.mocked(stat);

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
      
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockStat.mockResolvedValue({ size: 1024000 } as any);

      const result = await encoder.encodeSegment(
        'input.mp4',
        'output.mp4',
        mockOptions
      );

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('output.mp4');
      expect(result.fileSize).toBe(1024000);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle encoding errors', async () => {
      const encoder = new CPUEncoder();
      
      mockExecFileAsync.mockRejectedValue(new Error('Encoding failed'));

      const result = await encoder.encodeSegment(
        'input.mp4',
        'output.mp4',
        mockOptions
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Encoding failed');
    });

    it('should apply video speed filter', async () => {
      const encoder = new CPUEncoder();
      
      mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
        expect(args).toContain('-vf');
        const vfIndex = args.indexOf('-vf');
        expect(args[vfIndex + 1]).toContain('setpts');
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      mockStat.mockResolvedValue({ size: 1024000 } as any);

      await encoder.encodeSegment('input.mp4', 'output.mp4', {
        ...mockOptions,
        videoSpeed: 0.8
      });
    });

    it('should use correct FFmpeg arguments', async () => {
      const encoder = new CPUEncoder();
      
      mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
        expect(cmd).toBe('ffmpeg');
        expect(args).toContain('-c:v');
        expect(args).toContain('libx264');
        expect(args).toContain('-preset');
        expect(args).toContain('fast');
        expect(args).toContain('-crf');
        expect(args).toContain('23');
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      mockStat.mockResolvedValue({ size: 1024000 } as any);

      await encoder.encodeSegment('input.mp4', 'output.mp4', mockOptions);
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
