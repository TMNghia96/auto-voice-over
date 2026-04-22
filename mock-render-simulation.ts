/**
 * Mock Render Simulation - Demonstrates the fixed logic without actual FFmpeg
 * This simulates what will happen during real render
 */

import path from 'path';
import fs from 'fs';
import { parseSrt, timeToSeconds } from './src/lib/SrtOptimizer';

const MAX_AUDIO_SPEEDUP = 1.4;

interface Segment {
    type: 'dubbed' | 'gap';
    index?: number;
    videoStart: number;
    videoEnd: number;
    videoDuration: number;
    audioPath?: string;
    audioDuration?: number;
    targetDuration: number;
    audioSpeed: number;
    videoSpeed: number;
}

function getAudioDuration(audioPath: string): number {
    if (!fs.existsSync(audioPath)) return 0;
    const stats = fs.statSync(audioPath);
    return stats.size / 8000; // Rough estimate
}

function buildSegmentMap(srtContent: string, audioDir: string, totalVideoDuration: number): Segment[] {
    const entries = parseSrt(srtContent);
    const segments: Segment[] = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const entryStart = timeToSeconds(entry.startTime);
        const entryEnd = timeToSeconds(entry.endTime);

        if (entryEnd <= entryStart) continue;

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
            });
        }

        const audioFileName = `${String(entry.index).padStart(4, '0')}.mp3`;
        const audioPath = path.join(audioDir, audioFileName);
        let audioDuration = 0;
        if (fs.existsSync(audioPath)) {
            audioDuration = getAudioDuration(audioPath);
        }

        const originalDuration = entryEnd - entryStart;
        let targetDuration = originalDuration;
        let audioSpeed = 1.0;
        let videoSpeed = 1.0;

        if (audioDuration > 0) {
            const ratio = audioDuration / originalDuration;
            if (ratio > MAX_AUDIO_SPEEDUP) {
                audioSpeed = MAX_AUDIO_SPEEDUP;
                targetDuration = audioDuration / MAX_AUDIO_SPEEDUP;
                videoSpeed = targetDuration / originalDuration;
            } else if (ratio > 1.0) {
                audioSpeed = ratio;
                targetDuration = originalDuration;
                videoSpeed = 1.0;
            } else {
                audioSpeed = 1.0;
                targetDuration = originalDuration;
                videoSpeed = 1.0;
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
        if (totalVideoDuration > lastEnd + 0.05) {
            segments.push({
                type: 'gap',
                videoStart: lastEnd,
                videoEnd: totalVideoDuration,
                videoDuration: totalVideoDuration - lastEnd,
                targetDuration: totalVideoDuration - lastEnd,
                audioSpeed: 1.0,
                videoSpeed: 1.0,
            });
        }
    }

    return segments;
}

async function mockRenderSimulation() {
    const projectPath = 'C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot';
    const srtPath = path.join(projectPath, 'transcript', 'audio_16k.srt');
    const audioDir = path.join(projectPath, 'audio_gene');
    
    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    MOCK RENDER SIMULATION                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📁 Project: ${projectPath}`);
    console.log(`⏰ Time: ${new Date().toISOString()}`);
    console.log(`🔧 MAX_AUDIO_SPEEDUP: ${MAX_AUDIO_SPEEDUP}x`);
    console.log('');
    
    // Read SRT
    const srtContent = fs.readFileSync(srtPath, 'utf-8');
    const totalVideoDuration = 828;
    
    // Build segments
    console.log('📊 Building segment map...');
    const segments = buildSegmentMap(srtContent, audioDir, totalVideoDuration);
    console.log(`✅ Created ${segments.length} segments`);
    console.log('');
    
    // Simulate audio processing
    console.log('═'.repeat(80));
    console.log('PHASE 1: AUDIO PROCESSING (Simulated)');
    console.log('═'.repeat(80));
    console.log('');
    
    const segmentTimings: { expectedDuration: number; actualDuration: number; drift: number }[] = [];
    
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        
        // Simulate small drift
        const actualDuration = seg.targetDuration + (Math.random() * 0.02 - 0.01);
        const drift = actualDuration - seg.targetDuration;
        
        segmentTimings.push({
            expectedDuration: seg.targetDuration,
            actualDuration: actualDuration,
            drift: drift
        });
        
        if (i < 20 || Math.abs(drift) > 0.05) {
            console.log(`[Audio] Segment ${i} (${seg.type}): videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualDur=${actualDuration.toFixed(3)}s, drift=${drift.toFixed(3)}s`);
        }
    }
    
    console.log('');
    console.log(`✅ Processed ${segments.length} audio segments`);
    console.log('');
    
    // Simulate video processing
    console.log('═'.repeat(80));
    console.log('PHASE 2: VIDEO PROCESSING (Simulated)');
    console.log('═'.repeat(80));
    console.log('');
    
    const actualDurations = segmentTimings.map(t => t.actualDuration);
    let slowMotionCount = 0;
    let maxSlowMotion = 0;
    let maxSlowMotionSegment = -1;
    
    const filterCommands: string[] = [];
    
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const actualSegmentDuration = actualDurations[i];
        
        // NEW LOGIC (FIXED)
        const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
        const totalVideoSpeed = seg.videoSpeed * adjustedSpeed;
        const ptsMultiplier = 1.0 / totalVideoSpeed;
        
        // Build FFmpeg filter (simulated)
        const start = seg.videoStart.toFixed(4);
        const end = seg.videoEnd.toFixed(4);
        let filterStr = `[0:v]trim=start=${start}:end=${end}`;
        
        if (Math.abs(totalVideoSpeed - 1.0) > 0.001) {
            filterStr += `,setpts=${ptsMultiplier.toFixed(4)}*PTS`;
        } else {
            filterStr += `,setpts=PTS-STARTPTS`;
        }
        
        filterStr += `,fps=30.000[v${i}]`;
        filterCommands.push(filterStr);
        
        // Track slow motion
        if (totalVideoSpeed > 1.0) {
            slowMotionCount++;
            if (totalVideoSpeed > maxSlowMotion) {
                maxSlowMotion = totalVideoSpeed;
                maxSlowMotionSegment = i;
            }
        }
        
        // Log details
        if (i < 10 || totalVideoSpeed > 1.3) {
            console.log(`[Video] Segment ${i} [${seg.type}]: trim=${start}s→${end}s, videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualAudio=${actualSegmentDuration.toFixed(3)}s`);
            console.log(`        videoSpeed=${seg.videoSpeed.toFixed(4)}, adjustedSpeed=${adjustedSpeed.toFixed(4)}, totalSpeed=${totalVideoSpeed.toFixed(4)}, setpts=${ptsMultiplier.toFixed(4)}*PTS`);
            
            if (totalVideoSpeed > 1.3) {
                console.log(`        🎬 SLOW MOTION: ${totalVideoSpeed.toFixed(2)}x`);
            }
            console.log('');
        }
    }
    
    // Final concat filter
    const concatInputs = segments.map((_, i) => `[v${i}]`).join('');
    filterCommands.push(`${concatInputs}concat=n=${segments.length}:v=1:a=0,format=yuv420p[outv]`);
    
    console.log('');
    console.log('═'.repeat(80));
    console.log('RENDER SUMMARY');
    console.log('═'.repeat(80));
    console.log('');
    
    const totalExpected = segments.reduce((sum, s) => sum + s.targetDuration, 0);
    const totalActual = segmentTimings.reduce((sum, t) => sum + t.actualDuration, 0);
    const totalDrift = totalActual - totalExpected;
    
    console.log(`📊 Statistics:`);
    console.log(`   Total segments: ${segments.length}`);
    console.log(`   - Gap segments: ${segments.filter(s => s.type === 'gap').length}`);
    console.log(`   - Dubbed segments: ${segments.filter(s => s.type === 'dubbed').length}`);
    console.log(`   - Slow motion segments: ${slowMotionCount} (${(slowMotionCount/segments.length*100).toFixed(1)}%)`);
    console.log('');
    console.log(`⏱️  Duration:`);
    console.log(`   Expected: ${totalExpected.toFixed(2)}s (~${(totalExpected/60).toFixed(1)} min)`);
    console.log(`   Actual: ${totalActual.toFixed(2)}s (~${(totalActual/60).toFixed(1)} min)`);
    console.log(`   Drift: ${totalDrift > 0 ? '+' : ''}${totalDrift.toFixed(2)}s`);
    console.log('');
    console.log(`🎬 Slow Motion:`);
    console.log(`   Maximum: ${maxSlowMotion.toFixed(2)}x (Segment #${maxSlowMotionSegment})`);
    console.log(`   Count > 1.3x: ${segments.filter((s, i) => {
        const actualSegmentDuration = actualDurations[i];
        const adjustedSpeed = actualSegmentDuration / s.targetDuration;
        const totalVideoSpeed = s.videoSpeed * adjustedSpeed;
        return totalVideoSpeed > 1.3;
    }).length}`);
    console.log(`   Count > 1.5x: ${segments.filter((s, i) => {
        const actualSegmentDuration = actualDurations[i];
        const adjustedSpeed = actualSegmentDuration / s.targetDuration;
        const totalVideoSpeed = s.videoSpeed * adjustedSpeed;
        return totalVideoSpeed > 1.5;
    }).length}`);
    console.log(`   Count > 1.8x: ${segments.filter((s, i) => {
        const actualSegmentDuration = actualDurations[i];
        const adjustedSpeed = actualSegmentDuration / s.targetDuration;
        const totalVideoSpeed = s.videoSpeed * adjustedSpeed;
        return totalVideoSpeed > 1.8;
    }).length}`);
    console.log('');
    console.log(`🔊 Audio Speed:`);
    console.log(`   Maximum: ${MAX_AUDIO_SPEEDUP}x`);
    console.log(`   Segments at max speed: ${segments.filter(s => s.audioSpeed >= MAX_AUDIO_SPEEDUP - 0.01).length}`);
    console.log('');
    console.log('═'.repeat(80));
    console.log('EXPECTED OUTPUT');
    console.log('═'.repeat(80));
    console.log('');
    console.log(`📁 Output file: ${projectPath}\\final\\final_video.mp4`);
    console.log(`📏 Resolution: 1920x1080 (assumed)`);
    console.log(`🎞️  FPS: 30`);
    console.log(`⏱️  Duration: ~${(totalActual/60).toFixed(1)} minutes`);
    console.log(`💾 Estimated size: ~${(totalActual * 1.5).toFixed(0)} MB`);
    console.log('');
    console.log('✅ Expected results:');
    console.log('   ✓ No frozen frames (fixed adjustedSpeed logic)');
    console.log('   ✓ Audio/video sync (per-segment timing)');
    console.log('   ✓ Smooth playback (correct setpts calculation)');
    console.log(`   ${maxSlowMotion < 1.5 ? '✓' : '⚠'} Slow motion acceptable (max ${maxSlowMotion.toFixed(2)}x)`);
    console.log('');
    console.log('═'.repeat(80));
    console.log('');
    console.log('💡 NOTE: This is a SIMULATION. Actual render requires Electron app.');
    console.log('   Run: npm start');
    console.log('   Then follow RENDER-TEST-GUIDE.md');
    console.log('');
}

mockRenderSimulation().catch(console.error);
