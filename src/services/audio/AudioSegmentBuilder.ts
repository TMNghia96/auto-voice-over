import path from 'path';
import fs from 'fs';
import { parseSrt, timeToSeconds } from '../../lib/SrtOptimizer';
import { Segment } from '../video/types';
import { spawn } from 'child_process';
import { getFfmpegPath } from '../EnvironmentService';
import pLimit from 'p-limit';

const MAX_AUDIO_SPEEDUP = 1.4;

/**
 * Builds audio segment maps for video processing
 * Extracted from FinalVideoService for Phase 4A refactoring
 */
export class AudioSegmentBuilder {
  /**
   * Get media duration using FFmpeg with timeout
   */
  private getMediaDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      const ffmpeg = getFfmpegPath();
      const proc = spawn(ffmpeg, ['-i', filePath, '-f', 'null', '-'], { windowsHide: true });

      const timeout = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        console.warn(`[AudioSegmentBuilder] Timeout reading ${filePath}`);
        resolve(0);
      }, 8000);

      let stderr = '';
      proc.stderr.on('data', (data) => stderr += data.toString());

      proc.on('close', () => {
        clearTimeout(timeout);
        const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
        if (match) {
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const seconds = parseInt(match[3]);
          const decimals = parseFloat(`0.${match[4]}`);
          resolve(hours * 3600 + minutes * 60 + seconds + decimals);
        } else {
          resolve(0);
        }
      });
      proc.on('error', (err) => {
        clearTimeout(timeout);
        console.warn(`[AudioSegmentBuilder] FFmpeg error for ${filePath}:`, err.message);
        resolve(0);
      });
    });
  }

  /**
   * Build segment map from SRT content and audio files
   * 
   * @param projectPath - Path to the project directory
   * @param videoDuration - Total duration of the original video
   * @returns Array of segments with timing and audio information
   */
  async buildSegmentMap(
    projectPath: string,
    videoDuration: number
  ): Promise<Segment[]> {
    // Find SRT file
    const srtPath = this.findOriginalSrt(projectPath);
    if (!srtPath) {
      throw new Error('SRT file not found');
    }

    // Find audio directory
    const audioDir = path.join(projectPath, 'audio_gene');
    if (!fs.existsSync(audioDir)) {
      throw new Error('audio_gene directory not found');
    }

    // Read SRT content
    const srtContent = fs.readFileSync(srtPath, 'utf-8');
    const entries = parseSrt(srtContent);
    
    // ✅ Pre-fetch all audio durations in parallel (with concurrency limit)
    console.log(`[AudioSegmentBuilder] Pre-fetching durations for ${entries.length} audio files...`);
    const audioDurationMap = new Map<number, number>();
    const limit = pLimit(10); // Limit to 10 concurrent ffmpeg processes
    const durationPromises = entries.map(async (entry) => {
      const audioFileName = `${String(entry.index).padStart(4, '0')}.mp3`;
      const audioPath = path.join(audioDir, audioFileName);
      if (fs.existsSync(audioPath)) {
        try {
          const duration = await limit(() => this.getMediaDuration(audioPath));
          audioDurationMap.set(entry.index, duration);
        } catch (err) {
          console.warn(`[AudioSegmentBuilder] Failed to get duration for ${audioFileName}:`, err);
          audioDurationMap.set(entry.index, 0);
        }
      }
    });
    await Promise.all(durationPromises);
    console.log(`[AudioSegmentBuilder] ✅ Fetched ${audioDurationMap.size} audio durations`);

    const segments: Segment[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const entryStart = timeToSeconds(entry.startTime);
      const entryEnd = timeToSeconds(entry.endTime);

      if (entryEnd <= entryStart) continue; // Skip empty or invalid time segments

      const prevEnd = i === 0 ? 0 : timeToSeconds(entries[i - 1].endTime);
      if (entryStart > prevEnd + 0.05) {
        segments.push({
          type: 'gap',
          videoStart: prevEnd,
          videoEnd: entryStart,
          videoDuration: entryStart - prevEnd,
          targetDuration: entryStart - prevEnd,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
          fadeStart: i !== 0,
          fadeEnd: true,
        });
      }

      const audioFileName = `${String(entry.index).padStart(4, '0')}.mp3`;
      const audioPath = path.join(audioDir, audioFileName);
      const audioDuration = audioDurationMap.get(entry.index) || 0;

      const originalDuration = entryEnd - entryStart;
      let targetDuration = originalDuration;
      let audioSpeed = 1.0;
      let videoSpeed = 1.0;

      if (audioDuration > 0) {
        const ratio = audioDuration / originalDuration;
        if (ratio > MAX_AUDIO_SPEEDUP) {
          // Audio too long -> Speed up to max 1.4x and slow down video accordingly
          audioSpeed = MAX_AUDIO_SPEEDUP;
          targetDuration = audioDuration / MAX_AUDIO_SPEEDUP;
          videoSpeed = targetDuration / originalDuration;
          
          console.log(`[SegmentMap] Segment ${entry.index} (LONG AUDIO):`);
          console.log(`  videoStart: ${entryStart.toFixed(3)}s, videoEnd: ${entryEnd.toFixed(3)}s`);
          console.log(`  videoDuration: ${originalDuration.toFixed(3)}s`);
          console.log(`  audioDuration: ${audioDuration.toFixed(3)}s`);
          console.log(`  ratio: ${ratio.toFixed(4)} (> ${MAX_AUDIO_SPEEDUP})`);
          console.log(`  → audioSpeed: ${audioSpeed.toFixed(4)}`);
          console.log(`  → targetDuration: ${targetDuration.toFixed(3)}s`);
          console.log(`  → videoSpeed: ${videoSpeed.toFixed(4)} (slow motion)`);
        } else if (ratio > 1.0) {
          // Audio longer but <= 1.4x -> Speed up audio to fit originalDuration
          audioSpeed = ratio;
          targetDuration = originalDuration;
          videoSpeed = 1.0;
          
          console.log(`[SegmentMap] Segment ${entry.index} (SPEEDUP AUDIO):`);
          console.log(`  videoDuration: ${originalDuration.toFixed(3)}s, audioDuration: ${audioDuration.toFixed(3)}s`);
          console.log(`  ratio: ${ratio.toFixed(4)}`);
          console.log(`  → audioSpeed: ${audioSpeed.toFixed(4)}, targetDuration: ${targetDuration.toFixed(3)}s, videoSpeed: 1.0`);
        } else {
          // Audio shorter -> Keep 1.0x, pad silence at the end (targetDuration = originalDuration)
          audioSpeed = 1.0;
          targetDuration = originalDuration;
          videoSpeed = 1.0;
          
          if (ratio < 0.95) {
            console.log(`[SegmentMap] Segment ${entry.index} (SHORT AUDIO - PADDING):`);
            console.log(`  videoDuration: ${originalDuration.toFixed(3)}s, audioDuration: ${audioDuration.toFixed(3)}s`);
            console.log(`  ratio: ${ratio.toFixed(4)}`);
            console.log(`  → Will pad ${(originalDuration - audioDuration).toFixed(3)}s silence`);
          }
        }
      }

      segments.push({
        type: 'dubbed',
        index: entry.index,
        videoStart: entryStart,
        videoEnd: entryEnd,
        videoDuration: entryEnd - entryStart,
        audioPath: fs.existsSync(audioPath) ? audioPath : undefined,
        audioDuration,
        targetDuration,
        audioSpeed,
        videoSpeed,
      });
    }

    if (entries.length > 0) {
      const lastEnd = timeToSeconds(entries[entries.length - 1].endTime);
      if (videoDuration > lastEnd + 0.05) {
        segments.push({
          type: 'gap',
          videoStart: lastEnd,
          videoEnd: videoDuration,
          videoDuration: videoDuration - lastEnd,
          targetDuration: videoDuration - lastEnd,
          audioSpeed: 1.0,
          videoSpeed: 1.0,
          fadeStart: true,
          fadeEnd: false,
        });
      }
    }

    // DEBUG: Export segment map to JSON for analysis
    console.log(`[SegmentMap] Total segments: ${segments.length}`);
    const totalTargetDuration = segments.reduce((sum, s) => sum + s.targetDuration, 0);
    console.log(`[SegmentMap] Total target duration: ${totalTargetDuration.toFixed(3)}s`);
    console.log(`[SegmentMap] Original video duration: ${videoDuration.toFixed(3)}s`);
    console.log(`[SegmentMap] Duration difference: ${(totalTargetDuration - videoDuration).toFixed(3)}s`);
    
    // Count segments by type
    const dubbedCount = segments.filter(s => s.type === 'dubbed').length;
    const gapCount = segments.filter(s => s.type === 'gap').length;
    console.log(`[SegmentMap] Dubbed: ${dubbedCount}, Gap: ${gapCount}`);
    
    // Check for invalid segments
    const invalidSegments = segments.filter(s => s.targetDuration <= 0 || isNaN(s.targetDuration));
    if (invalidSegments.length > 0) {
      console.error(`[SegmentMap] WARNING: ${invalidSegments.length} segments have invalid targetDuration!`);
      invalidSegments.forEach(s => {
        console.error(`  Segment ${s.index || 'gap'}: targetDuration=${s.targetDuration}`);
      });
    }

    return segments;
  }

  /**
   * Find the original SRT file in the project
   */
  private findOriginalSrt(projectPath: string): string | null {
    const srtDir = path.join(projectPath, 'transcript');
    if (!fs.existsSync(srtDir)) return null;
    const files = fs.readdirSync(srtDir);
    const srtFile = files.find(f => f.endsWith('.srt'));
    return srtFile ? path.join(srtDir, srtFile) : null;
  }
}
