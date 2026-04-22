/**
 * Test script to verify FinalVideoService bug fixes
 * Creates test video and runs final video generation
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { createFinalVideo } from './src/services/FinalVideoService';

const TEST_PROJECT_DIR = path.join(__dirname, 'test_project_bugfix');

// Helper to run FFmpeg commands
const runFfmpeg = (args: string[]): Promise<boolean> => {
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', args, { windowsHide: true });
        let stderr = '';
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code !== 0) {
                console.error('FFmpeg error:', stderr);
            }
            resolve(code === 0);
        });
        
        proc.on('error', (err) => {
            console.error('FFmpeg spawn error:', err);
            resolve(false);
        });
    });
};

// Create test video (30 seconds, 1280x720, 30fps)
async function createTestVideo(): Promise<string> {
    console.log('Creating test video...');
    
    const videoPath = path.join(TEST_PROJECT_DIR, 'original', 'video', 'test_video.mp4');
    fs.mkdirSync(path.dirname(videoPath), { recursive: true });
    
    // Create 30s test video with color changing every 2 seconds
    const success = await runFfmpeg([
        '-f', 'lavfi',
        '-i', 'testsrc=duration=30:size=1280x720:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=440:duration=30',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-y',
        videoPath
    ]);
    
    if (!success) {
        throw new Error('Failed to create test video');
    }
    
    console.log(`✓ Test video created: ${videoPath}`);
    return videoPath;
}

// Create test SRT with many segments
function createTestSrt(numSegments: number): string {
    console.log(`Creating test SRT with ${numSegments} segments...`);
    
    const srtPath = path.join(TEST_PROJECT_DIR, 'transcript', 'test.srt');
    fs.mkdirSync(path.dirname(srtPath), { recursive: true });
    
    let srtContent = '';
    const segmentDuration = 30 / numSegments; // Distribute evenly over 30s
    
    for (let i = 0; i < numSegments; i++) {
        const start = i * segmentDuration;
        const end = (i + 1) * segmentDuration;
        
        const startTime = formatSrtTime(start);
        const endTime = formatSrtTime(end);
        
        srtContent += `${i + 1}\n`;
        srtContent += `${startTime} --> ${endTime}\n`;
        srtContent += `Test segment ${i + 1}\n\n`;
    }
    
    fs.writeFileSync(srtPath, srtContent, 'utf-8');
    console.log(`✓ Test SRT created: ${srtPath}`);
    return srtPath;
}

// Format time for SRT (HH:MM:SS,mmm)
function formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Create test audio files
async function createTestAudioFiles(numSegments: number): Promise<void> {
    console.log(`Creating ${numSegments} test audio files...`);
    
    const audioDir = path.join(TEST_PROJECT_DIR, 'audio_gene');
    fs.mkdirSync(audioDir, { recursive: true });
    
    const segmentDuration = 30 / numSegments;
    
    for (let i = 0; i < numSegments; i++) {
        const audioPath = path.join(audioDir, `${String(i + 1).padStart(4, '0')}.mp3`);
        
        // Create audio with different frequency for each segment
        const frequency = 440 + (i * 10); // Vary frequency
        const duration = segmentDuration * (0.9 + Math.random() * 0.2); // Vary duration slightly
        
        const success = await runFfmpeg([
            '-f', 'lavfi',
            '-i', `sine=frequency=${frequency}:duration=${duration.toFixed(3)}`,
            '-c:a', 'libmp3lame',
            '-b:a', '128k',
            '-y',
            audioPath
        ]);
        
        if (!success) {
            throw new Error(`Failed to create audio file ${i + 1}`);
        }
        
        if ((i + 1) % 10 === 0) {
            console.log(`  Created ${i + 1}/${numSegments} audio files...`);
        }
    }
    
    console.log(`✓ All ${numSegments} audio files created`);
}

// Run test
async function runTest(numSegments: number) {
    console.log('\n=================================================');
    console.log(`TEST: FinalVideoService with ${numSegments} segments`);
    console.log('=================================================\n');
    
    try {
        // Clean up previous test
        if (fs.existsSync(TEST_PROJECT_DIR)) {
            fs.rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
        }
        
        // Create test data
        await createTestVideo();
        createTestSrt(numSegments);
        await createTestAudioFiles(numSegments);
        
        console.log('\n--- Starting Final Video Generation ---\n');
        
        // Run FinalVideoService
        const startTime = Date.now();
        let lastProgress = 0;
        
        const result = await createFinalVideo(
            TEST_PROJECT_DIR,
            (progress) => {
                if (progress.progress >= lastProgress + 5 || progress.status === 'done' || progress.status === 'error') {
                    console.log(`[${progress.status.toUpperCase()}] ${progress.progress}% - ${progress.detail}`);
                    lastProgress = progress.progress;
                }
            },
            0.15, // duckVolume
            0.5   // fadeDuration
        );
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(1);
        
        console.log('\n=================================================');
        if (result) {
            console.log('✅ TEST PASSED');
            console.log(`✓ Output: ${result}`);
            console.log(`✓ Duration: ${duration}s`);
            console.log(`✓ Segments: ${numSegments}`);
            
            // Check file exists
            if (fs.existsSync(result)) {
                const stats = fs.statSync(result);
                console.log(`✓ File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            }
            
            console.log('\n📋 VERIFICATION CHECKLIST:');
            console.log('  [ ] Check console log for [Batch] messages (if >30 segments)');
            console.log('  [ ] Check GPU encoding was used (AMD AMF / NVIDIA NVENC)');
            console.log('  [ ] Play video and verify no frozen frames');
            console.log('  [ ] Verify audio sync');
            console.log('  [ ] Check video is smooth at segment boundaries');
            
        } else {
            console.log('❌ TEST FAILED');
            console.log('✗ Final video generation failed');
        }
        console.log('=================================================\n');
        
    } catch (err: any) {
        console.error('\n❌ TEST ERROR:', err.message);
        console.error(err.stack);
    }
}

// Main
(async () => {
    console.log('FinalVideoService Bug Fix Test Suite');
    console.log('=====================================\n');
    
    // Test 1: Small project (20 segments - single pass)
    console.log('TEST 1: Small project (20 segments - single pass)');
    await runTest(20);
    
    // Test 2: Medium project (50 segments - 2 batches)
    console.log('\n\nTEST 2: Medium project (50 segments - 2 batches)');
    await runTest(50);
    
    // Test 3: Large project (100 segments - 4 batches)
    console.log('\n\nTEST 3: Large project (100 segments - 4 batches)');
    await runTest(100);
    
    console.log('\n\n✅ ALL TESTS COMPLETED');
    console.log('Check output videos in test_project_bugfix/final/');
})();
