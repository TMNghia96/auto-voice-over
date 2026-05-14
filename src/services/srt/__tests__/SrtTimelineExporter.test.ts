import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { SrtTimelineExporter } from '../SrtTimelineExporter';
import { ValidatedSegment } from '../../video/types';

describe('SrtTimelineExporter', () => {
  let outputPath = '';

  afterEach(() => {
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  });

  it('exports SRT without float milliseconds', () => {
    const segments: ValidatedSegment[] = [
      {
        type: 'dubbed',
        index: 1,
        videoStart: 0,
        videoEnd: 5.133,
        videoDuration: 5.133,
        audioDuration: 2.4,
        targetDuration: 5.133,
        adjustedVideoSpeed: 1.0,
        audioSpeed: 1.0,
        videoSpeed: 1.0,
      },
    ];

    const inputSrt = [
      '1',
      '00:00:00,098 --> 00:00:19,319',
      'Xin chào',
      '',
    ].join('\n');

    outputPath = path.join(os.tmpdir(), `srt-export-${Date.now()}.srt`);
    const exporter = new SrtTimelineExporter();
    exporter.export(segments, inputSrt, outputPath);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const lines = content.split('\n');
    const timeLine = lines[1];
    expect(timeLine).toMatch(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/);
  });

  it('writes file at outputPath', () => {
    const segments: ValidatedSegment[] = [];
    outputPath = path.join(os.tmpdir(), `srt-export-empty-${Date.now()}.srt`);
    const exporter = new SrtTimelineExporter();
    const result = exporter.export(segments, '', outputPath);
    expect(result).toBe(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});
