import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioSegmentBuilder } from '../../../src/services/audio/AudioSegmentBuilder';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

vi.mock('child_process');
vi.mock('../../../src/services/EnvironmentService', () => ({
  getFfmpegPath: () => 'ffmpeg'
}));

describe('AudioSegmentBuilder', () => {
  let builder: AudioSegmentBuilder;
  let testProjectPath: string;

  beforeEach(() => {
    builder = new AudioSegmentBuilder();
    testProjectPath = path.join(__dirname, 'test-project');
    
    // Create test directory structure
    fs.mkdirSync(testProjectPath, { recursive: true });
    fs.mkdirSync(path.join(testProjectPath, 'transcript'), { recursive: true });
    fs.mkdirSync(path.join(testProjectPath, 'audio_gene'), { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directories
    if (fs.existsSync(testProjectPath)) {
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('buildSegmentMap', () => {
    it('should throw error if SRT file not found', async () => {
      await expect(builder.buildSegmentMap(testProjectPath, 100))
        .rejects.toThrow('SRT file not found');
    });

    it('should throw error if audio_gene directory not found', async () => {
      // Create SRT file
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      fs.writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:05,000\nTest subtitle\n');
      
      // Remove audio_gene directory
      fs.rmSync(path.join(testProjectPath, 'audio_gene'), { recursive: true });

      await expect(builder.buildSegmentMap(testProjectPath, 100))
        .rejects.toThrow('audio_gene directory not found');
    });

    it('should create segments from SRT entries', async () => {
      // Create SRT file with 2 entries
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
First subtitle

2
00:00:10,000 --> 00:00:15,000
Second subtitle
`;
      fs.writeFileSync(srtPath, srtContent);

      // Mock FFmpeg spawn for getMediaDuration
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProc: any = {
          stderr: {
            on: (event: string, callback: Function) => {
              if (event === 'data') {
                callback(Buffer.from('Duration: 00:00:03.500'));
              }
            }
          },
          on: (event: string, callback: Function) => {
            if (event === 'close') {
              callback(0);
            }
          }
        };
        return mockProc;
      }) as any);

      const segments = await builder.buildSegmentMap(testProjectPath, 20);

      // Should have: dubbed segment 1, gap, dubbed segment 2, final gap
      expect(segments.length).toBe(4);
      
      // First segment: dubbed (0-5s)
      expect(segments[0].type).toBe('dubbed');
      expect(segments[0].videoStart).toBe(0);
      expect(segments[0].videoEnd).toBe(5);
      expect(segments[0].videoDuration).toBe(5);
      
      // Second segment: gap (5-10s)
      expect(segments[1].type).toBe('gap');
      expect(segments[1].videoStart).toBe(5);
      expect(segments[1].videoEnd).toBe(10);
      expect(segments[1].videoDuration).toBe(5);
      
      // Third segment: dubbed (10-15s)
      expect(segments[2].type).toBe('dubbed');
      expect(segments[2].videoStart).toBe(10);
      expect(segments[2].videoEnd).toBe(15);
      
      // Fourth segment: final gap (15-20s)
      expect(segments[3].type).toBe('gap');
      expect(segments[3].videoStart).toBe(15);
      expect(segments[3].videoEnd).toBe(20);
    });

    it('should handle audio speedup when audio is longer than video (ratio <= 1.4)', async () => {
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
Test subtitle
`;
      fs.writeFileSync(srtPath, srtContent);

      // Create audio file
      const audioPath = path.join(testProjectPath, 'audio_gene', '0001.mp3');
      fs.writeFileSync(audioPath, 'dummy audio');

      // Mock FFmpeg to return audio duration of 6s (ratio = 6/5 = 1.2)
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProc: any = {
          stderr: {
            on: (event: string, callback: Function) => {
              if (event === 'data') {
                callback(Buffer.from('Duration: 00:00:06.000'));
              }
            }
          },
          on: (event: string, callback: Function) => {
            if (event === 'close') {
              callback(0);
            }
          }
        };
        return mockProc;
      }) as any);

      const segments = await builder.buildSegmentMap(testProjectPath, 10);

      const dubbedSegment = segments.find(s => s.type === 'dubbed');
      expect(dubbedSegment).toBeDefined();
      expect(dubbedSegment!.audioSpeed).toBeCloseTo(1.2, 1);
      expect(dubbedSegment!.videoSpeed).toBe(1.0);
      expect(dubbedSegment!.targetDuration).toBe(5); // Should match original duration
    });

    it('should handle slow motion when audio is too long (ratio > 1.4)', async () => {
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
Test subtitle
`;
      fs.writeFileSync(srtPath, srtContent);

      // Create audio file
      const audioPath = path.join(testProjectPath, 'audio_gene', '0001.mp3');
      fs.writeFileSync(audioPath, 'dummy audio');

      // Mock FFmpeg to return audio duration of 8s (ratio = 8/5 = 1.6 > 1.4)
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProc: any = {
          stderr: {
            on: (event: string, callback: Function) => {
              if (event === 'data') {
                callback(Buffer.from('Duration: 00:00:08.000'));
              }
            }
          },
          on: (event: string, callback: Function) => {
            if (event === 'close') {
              callback(0);
            }
          }
        };
        return mockProc;
      }) as any);

      const segments = await builder.buildSegmentMap(testProjectPath, 10);

      const dubbedSegment = segments.find(s => s.type === 'dubbed');
      expect(dubbedSegment).toBeDefined();
      expect(dubbedSegment!.audioSpeed).toBe(1.4); // Max speedup
      expect(dubbedSegment!.targetDuration).toBeCloseTo(8 / 1.4, 1); // 5.71s
      expect(dubbedSegment!.videoSpeed).toBeCloseTo((8 / 1.4) / 5, 1); // Slow motion
    });

    it('should handle short audio with padding', async () => {
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
Test subtitle
`;
      fs.writeFileSync(srtPath, srtContent);

      // Create audio file
      const audioPath = path.join(testProjectPath, 'audio_gene', '0001.mp3');
      fs.writeFileSync(audioPath, 'dummy audio');

      // Mock FFmpeg to return audio duration of 3s (ratio = 3/5 = 0.6 < 1.0)
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProc: any = {
          stderr: {
            on: (event: string, callback: Function) => {
              if (event === 'data') {
                callback(Buffer.from('Duration: 00:00:03.000'));
              }
            }
          },
          on: (event: string, callback: Function) => {
            if (event === 'close') {
              callback(0);
            }
          }
        };
        return mockProc;
      }) as any);

      const segments = await builder.buildSegmentMap(testProjectPath, 10);

      const dubbedSegment = segments.find(s => s.type === 'dubbed');
      expect(dubbedSegment).toBeDefined();
      expect(dubbedSegment!.audioSpeed).toBe(1.0);
      expect(dubbedSegment!.videoSpeed).toBe(1.0);
      expect(dubbedSegment!.targetDuration).toBe(5); // Original duration, will pad silence
    });

    it('should set fade flags for gap segments', async () => {
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
First subtitle

2
00:00:10,000 --> 00:00:15,000
Second subtitle
`;
      fs.writeFileSync(srtPath, srtContent);

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProc: any = {
          stderr: {
            on: (event: string, callback: Function) => {
              if (event === 'data') {
                callback(Buffer.from('Duration: 00:00:03.000'));
              }
            }
          },
          on: (event: string, callback: Function) => {
            if (event === 'close') {
              callback(0);
            }
          }
        };
        return mockProc;
      }) as any);

      const segments = await builder.buildSegmentMap(testProjectPath, 20);

      // Gap between dubbed segments should have both fade flags
      const middleGap = segments.find((s, i) => 
        s.type === 'gap' && 
        i > 0 && 
        i < segments.length - 1
      );
      expect(middleGap).toBeDefined();
      expect(middleGap!.fadeStart).toBe(true);
      expect(middleGap!.fadeEnd).toBe(true);

      // Final gap should only have fadeStart
      const finalGap = segments[segments.length - 1];
      expect(finalGap.type).toBe('gap');
      expect(finalGap.fadeStart).toBe(true);
      expect(finalGap.fadeEnd).toBe(false);
    });

    it('should skip segments with invalid time ranges', async () => {
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      const srtContent = `1
00:00:05,000 --> 00:00:05,000
Invalid segment

2
00:00:10,000 --> 00:00:15,000
Valid segment
`;
      fs.writeFileSync(srtPath, srtContent);

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProc: any = {
          stderr: {
            on: (event: string, callback: Function) => {
              if (event === 'data') {
                callback(Buffer.from('Duration: 00:00:03.000'));
              }
            }
          },
          on: (event: string, callback: Function) => {
            if (event === 'close') {
              callback(0);
            }
          }
        };
        return mockProc;
      }) as any);

      const segments = await builder.buildSegmentMap(testProjectPath, 20);

      // Should only have valid segment + gaps
      const dubbedSegments = segments.filter(s => s.type === 'dubbed');
      expect(dubbedSegments.length).toBe(1);
      expect(dubbedSegments[0].videoStart).toBe(10);
    });

    it('should handle missing audio files gracefully', async () => {
      const srtPath = path.join(testProjectPath, 'transcript', 'test.srt');
      const srtContent = `1
00:00:00,000 --> 00:00:05,000
Test subtitle
`;
      fs.writeFileSync(srtPath, srtContent);

      // Don't create audio file - it's missing

      const segments = await builder.buildSegmentMap(testProjectPath, 10);

      const dubbedSegment = segments.find(s => s.type === 'dubbed');
      expect(dubbedSegment).toBeDefined();
      expect(dubbedSegment!.audioPath).toBeUndefined();
      expect(dubbedSegment!.audioDuration).toBe(0);
      expect(dubbedSegment!.audioSpeed).toBe(1.0);
      expect(dubbedSegment!.videoSpeed).toBe(1.0);
    });
  });
});
