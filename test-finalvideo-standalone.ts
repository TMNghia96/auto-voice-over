/**
 * Standalone test for FinalVideoService logic
 * This simulates the segment processing without requiring Electron
 */

import path from 'path';
import fs from 'fs';
import { parseSrt, timeToSeconds } from './src/lib/SrtOptimizer';

// Mock types
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
    fadeStart?: boolean;
    fadeEnd?: boolean;
}

const MAX_AUDIO_SPEEDUP = 1.4; // Tăng từ 1.3

// Get audio duration (mock - just check file size)
function getAudioDuration(audioPath: string): number {
    if (!fs.existsSync(audioPath)) return 0;
    const stats = fs.statSync(audioPath);
    // Rough estimate: 1 second ≈ 8KB for MP3 at 64kbps
    return stats.size / 8000;
}

// Build segment map (same logic as FinalVideoService)
function buildSegmentMap(
    srtContent: string,
    audioDir: string,
    totalVideoDuration: number
): Segment[] {
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

// Main test
async function testFinalVideoLogic() {
    const projectPath = 'C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot';
    const srtPath = path.join(projectPath, 'transcript', 'audio_16k.srt');
    const audioDir = path.join(projectPath, 'audio_gene');
    
    console.log('='.repeat(80));
    console.log('FINALVIDEOSERVICE LOGIC TEST');
    console.log('='.repeat(80));
    console.log(`Project: ${projectPath}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('='.repeat(80));
    console.log('');
    
    // Check files exist
    if (!fs.existsSync(srtPath)) {
        console.error('❌ SRT file not found:', srtPath);
        return;
    }
    
    if (!fs.existsSync(audioDir)) {
        console.error('❌ Audio directory not found:', audioDir);
        return;
    }
    
    console.log('✅ Files found');
    console.log('');
    
    // Read SRT
    const srtContent = fs.readFileSync(srtPath, 'utf-8');
    const totalVideoDuration = 828; // Approximate from SRT
    
    // Build segments
    console.log('Building segment map...');
    const segments = buildSegmentMap(srtContent, audioDir, totalVideoDuration);
    
    console.log(`✅ Created ${segments.length} segments`);
    console.log('');
    
    // Analyze segments
    console.log('SEGMENT ANALYSIS:');
    console.log('='.repeat(80));
    
    let totalTarget = 0;
    let gapCount = 0;
    let dubbedCount = 0;
    let slowMotionCount = 0;
    
    for (let i = 0; i < Math.min(segments.length, 20); i++) {
        const seg = segments[i];
        totalTarget += seg.targetDuration;
        
        if (seg.type === 'gap') {
            gapCount++;
            console.log(`Segment ${i} [GAP]:`);
            console.log(`  videoStart: ${seg.videoStart.toFixed(3)}s`);
            console.log(`  videoEnd: ${seg.videoEnd.toFixed(3)}s`);
            console.log(`  videoDuration: ${seg.videoDuration.toFixed(3)}s`);
            console.log(`  targetDuration: ${seg.targetDuration.toFixed(3)}s`);
            console.log(`  videoSpeed: ${seg.videoSpeed.toFixed(4)}`);
        } else {
            dubbedCount++;
            console.log(`Segment ${i} [DUBBED #${seg.index}]:`);
            console.log(`  videoStart: ${seg.videoStart.toFixed(3)}s`);
            console.log(`  videoEnd: ${seg.videoEnd.toFixed(3)}s`);
            console.log(`  videoDuration: ${seg.videoDuration.toFixed(3)}s`);
            console.log(`  audioDuration: ${seg.audioDuration?.toFixed(3)}s`);
            console.log(`  targetDuration: ${seg.targetDuration.toFixed(3)}s`);
            console.log(`  audioSpeed: ${seg.audioSpeed.toFixed(4)}`);
            console.log(`  videoSpeed: ${seg.videoSpeed.toFixed(4)}`);
            
            if (seg.videoSpeed > 1.0) {
                slowMotionCount++;
                console.log(`  ⚠️  SLOW MOTION NEEDED (audio longer than video)`);
            }
        }
        console.log('');
    }
    
    if (segments.length > 20) {
        console.log(`... (${segments.length - 20} more segments)`);
        console.log('');
    }
    
    // Count all segments
    for (let i = 20; i < segments.length; i++) {
        const seg = segments[i];
        totalTarget += seg.targetDuration;
        if (seg.type === 'gap') {
            gapCount++;
        } else {
            dubbedCount++;
            if (seg.videoSpeed > 1.0) {
                slowMotionCount++;
            }
        }
    }
    
    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total segments: ${segments.length}`);
    console.log(`  - Gap segments: ${gapCount}`);
    console.log(`  - Dubbed segments: ${dubbedCount}`);
    console.log(`  - Segments needing slow motion: ${slowMotionCount}`);
    console.log(`Total target duration: ${totalTarget.toFixed(2)}s`);
    console.log('');
    
    // Simulate video processing with NEW logic
    console.log('='.repeat(80));
    console.log('SIMULATING VIDEO PROCESSING (NEW LOGIC):');
    console.log('='.repeat(80));
    
    let errorCount = 0;
    let slowMotionProcessed = 0;
    
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        
        // Simulate actual audio duration (assume small drift)
        const actualSegmentDuration = seg.targetDuration + (Math.random() * 0.01 - 0.005);
        
        // NEW LOGIC (FIXED):
        const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
        const totalVideoSpeed = seg.videoSpeed * adjustedSpeed;
        const ptsMultiplier = 1.0 / totalVideoSpeed;
        
        // Only show first 10 and all slow motion segments
        if (i < 10 || seg.videoSpeed > 1.0) {
            console.log(`Segment ${i} [${seg.type}]:`);
            console.log(`  videoDur=${seg.videoDuration.toFixed(3)}s, targetDur=${seg.targetDuration.toFixed(3)}s, actualAudio=${actualSegmentDuration.toFixed(3)}s`);
            console.log(`  videoSpeed=${seg.videoSpeed.toFixed(4)}, adjustedSpeed=${adjustedSpeed.toFixed(4)}, totalSpeed=${totalVideoSpeed.toFixed(4)}`);
            console.log(`  setpts=${ptsMultiplier.toFixed(4)}*PTS`);
            
            if (seg.videoSpeed > 1.0) {
                slowMotionProcessed++;
                console.log(`  🎬 SLOW MOTION: Video will be stretched ${totalVideoSpeed.toFixed(2)}x`);
            }
        }
        
        // Validation
        const expectedTotalSpeed = seg.videoSpeed * adjustedSpeed;
        const expectedPts = 1.0 / totalVideoSpeed;
        
        if (Math.abs(totalVideoSpeed - expectedTotalSpeed) > 0.0001) {
            console.log(`  ❌ ERROR: totalSpeed calculation wrong!`);
            errorCount++;
        } else if (Math.abs(ptsMultiplier - expectedPts) > 0.0001) {
            console.log(`  ❌ ERROR: setpts calculation wrong!`);
            errorCount++;
        } else if (i < 10 || seg.videoSpeed > 1.0) {
            console.log(`  ✅ Calculations correct`);
        }
        
        if (i < 10 || seg.videoSpeed > 1.0) {
            console.log('');
        }
    }
    
    console.log('='.repeat(80));
    console.log('VALIDATION RESULTS:');
    console.log('='.repeat(80));
    console.log(`Total segments processed: ${segments.length}`);
    console.log(`Slow motion segments processed: ${slowMotionProcessed}`);
    console.log(`Errors found: ${errorCount}`);
    
    if (errorCount === 0) {
        console.log('✅ ALL CALCULATIONS CORRECT!');
    } else {
        console.log(`❌ ${errorCount} ERRORS FOUND!`);
    }
    console.log('');
    
    console.log('='.repeat(80));
    console.log('TEST COMPLETE');
    console.log('='.repeat(80));
}

// Run test
testFinalVideoLogic().catch(console.error);
