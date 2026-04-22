import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EncodeOptions } from '../../../../src/services/video/types';

// Create mock function that will be used by promisify
const mockExecFileAsync = vi.fn();

// Mock the modules before importing GPUEncoder
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
const { GPUEncoder } = await import('../../../../src/services/video/encoders/GPUEncoder');
const { stat } = await import('fs/promises');

describe('GPUEncoder', () => {
  const mockStat = vi.mocked(stat);

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
      
      mockExecFileAsync.mockResolvedValue({ 
        stdout: '', 
        stderr: 'Encoding successful' 
      });

      const available = await encoder.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when encoder not found', async () => {
      const encoder = new GPUEncoder('nvidia');
      
      mockExecFileAsync.mockResolvedValue({ 
        stdout: '', 
        stderr: 'Unknown encoder h264_nvenc' 
      });

      const available = await encoder.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false when no NVENC devices found', async () => {
      const encoder = new GPUEncoder('nvidia');
      
      mockExecFileAsync.mockResolvedValue({ 
        stdout: '', 
        stderr: 'No NVENC capable devices found' 
      });

      const available = await encoder.isAvailable();
      expect(available).toBe(false);
    });

    it('should cache availability result', async () => {
      const encoder = new GPUEncoder('amd');
      
      mockExecFileAsync.mockResolvedValue({ 
        stdout: '', 
        stderr: 'Success' 
      });

      await encoder.isAvailable();
      await encoder.isAvailable();

      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
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
      const encoder = new GPUEncoder('amd');
      
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
      const encoder = new GPUEncoder('nvidia');
      
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

    it('should include setpts filter for video speed', () => {
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
      expect(args[vfIndex + 1]).toBe('setpts=2.000000*PTS');
    });

    it('should not include filter when speed is 1.0', () => {
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

      expect(args).not.toContain('-vf');
    });
  });
});
