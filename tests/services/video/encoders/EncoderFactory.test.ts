import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EncoderFactory } from '../../../../src/services/video/encoders/EncoderFactory';

// Mock the encoder classes with proper constructor functions
vi.mock('../../../../src/services/video/encoders/GPUEncoder', () => ({
  GPUEncoder: vi.fn()
}));

vi.mock('../../../../src/services/video/encoders/CPUEncoder', () => ({
  CPUEncoder: vi.fn()
}));

const { GPUEncoder } = await import('../../../../src/services/video/encoders/GPUEncoder');
const { CPUEncoder } = await import('../../../../src/services/video/encoders/CPUEncoder');

const MockGPUEncoder = vi.mocked(GPUEncoder);
const MockCPUEncoder = vi.mocked(CPUEncoder);

describe('EncoderFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockGPUEncoder.mockClear();
    MockCPUEncoder.mockClear();
  });

  describe('createEncoder with auto preference', () => {
    it('should return NVIDIA encoder when available', async () => {
      const factory = new EncoderFactory('auto');
      
      const mockNvidiaEncoder = {
        name: 'h264_nvenc',
        type: 'gpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      MockGPUEncoder.mockImplementation(function(this: any, type: any) {
        if (type === 'nvidia') return mockNvidiaEncoder;
        return { isAvailable: vi.fn().mockResolvedValue(false) };
      });

      const encoder = await factory.createEncoder();
      
      expect(encoder.name).toBe('h264_nvenc');
      expect(mockNvidiaEncoder.isAvailable).toHaveBeenCalled();
    });

    it('should return AMD encoder when NVIDIA not available', async () => {
      const factory = new EncoderFactory('auto');
      
      const mockAmdEncoder = {
        name: 'h264_amf',
        type: 'gpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      MockGPUEncoder.mockImplementation(function(this: any, type: any) {
        if (type === 'nvidia') {
          return { isAvailable: vi.fn().mockResolvedValue(false) };
        }
        if (type === 'amd') return mockAmdEncoder;
        return { isAvailable: vi.fn().mockResolvedValue(false) };
      });

      const encoder = await factory.createEncoder();
      
      expect(encoder.name).toBe('h264_amf');
      expect(mockAmdEncoder.isAvailable).toHaveBeenCalled();
    });

    it('should return CPU encoder when no GPU available', async () => {
      const factory = new EncoderFactory('auto');
      
      const mockCpuEncoder = {
        name: 'libx264',
        type: 'cpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      MockGPUEncoder.mockImplementation(function(this: any) {
        return { isAvailable: vi.fn().mockResolvedValue(false) };
      });

      MockCPUEncoder.mockImplementation(function(this: any) {
        return mockCpuEncoder;
      });

      const encoder = await factory.createEncoder();
      
      expect(encoder.name).toBe('libx264');
    });
  });

  describe('createEncoder with gpu preference', () => {
    it('should return GPU encoder when available', async () => {
      const factory = new EncoderFactory('gpu');
      
      const mockNvidiaEncoder = {
        name: 'h264_nvenc',
        type: 'gpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      MockGPUEncoder.mockImplementation(function(this: any, type: any) {
        if (type === 'nvidia') return mockNvidiaEncoder;
        return { isAvailable: vi.fn().mockResolvedValue(false) };
      });

      const encoder = await factory.createEncoder();
      
      expect(encoder.name).toBe('h264_nvenc');
    });

    it('should fallback to CPU when GPU not available', async () => {
      const factory = new EncoderFactory('gpu');
      
      const mockCpuEncoder = {
        name: 'libx264',
        type: 'cpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      MockGPUEncoder.mockImplementation(function(this: any) {
        return { isAvailable: vi.fn().mockResolvedValue(false) };
      });

      MockCPUEncoder.mockImplementation(function(this: any) {
        return mockCpuEncoder;
      });

      const encoder = await factory.createEncoder();
      
      expect(encoder.name).toBe('libx264');
    });
  });

  describe('createEncoder with cpu preference', () => {
    it('should always return CPU encoder', async () => {
      const factory = new EncoderFactory('cpu');
      
      const mockCpuEncoder = {
        name: 'libx264',
        type: 'cpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      MockCPUEncoder.mockImplementation(function(this: any) {
        return mockCpuEncoder;
      });

      const encoder = await factory.createEncoder();
      
      expect(encoder.name).toBe('libx264');
      expect(MockGPUEncoder).not.toHaveBeenCalled();
    });
  });

  describe('encoder caching', () => {
    it('should cache encoder after first creation', async () => {
      const factory = new EncoderFactory('cpu');
      
      const mockCpuEncoder = {
        name: 'libx264',
        type: 'cpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      MockCPUEncoder.mockImplementation(function(this: any) {
        return mockCpuEncoder;
      });

      const encoder1 = await factory.createEncoder();
      const encoder2 = await factory.createEncoder();
      
      expect(encoder1).toBe(encoder2);
      expect(MockCPUEncoder).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when requested', async () => {
      const factory = new EncoderFactory('cpu');
      
      const mockCpuEncoder1 = {
        name: 'libx264',
        type: 'cpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      const mockCpuEncoder2 = {
        name: 'libx264',
        type: 'cpu',
        isAvailable: vi.fn().mockResolvedValue(true)
      };

      let callCount = 0;
      MockCPUEncoder.mockImplementation(function(this: any) {
        callCount++;
        return callCount === 1 ? mockCpuEncoder1 : mockCpuEncoder2;
      });

      const encoder1 = await factory.createEncoder();
      factory.clearCache();
      const encoder2 = await factory.createEncoder();
      
      expect(encoder1).not.toBe(encoder2);
      expect(MockCPUEncoder).toHaveBeenCalledTimes(2);
    });
  });

  describe('GPU detection priority', () => {
    it('should try NVIDIA before AMD', async () => {
      const factory = new EncoderFactory('auto');
      
      const callOrder: string[] = [];

      MockGPUEncoder.mockImplementation(function(this: any, type: any) {
        callOrder.push(type);
        return { isAvailable: vi.fn().mockResolvedValue(false) };
      });

      MockCPUEncoder.mockImplementation(function(this: any) {
        return {
          name: 'libx264',
          type: 'cpu'
        };
      });

      await factory.createEncoder();
      
      expect(callOrder[0]).toBe('nvidia');
      expect(callOrder[1]).toBe('amd');
    });
  });
});
