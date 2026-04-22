/**
 * Real-world test script for FinalVideoService rebuild
 * Tests with actual video files from 200conongdot project
 */

import { createFinalVideo } from '../src/services/FinalVideoService';
import path from 'path';
import fs from 'fs';

interface TestResult {
  success: boolean;
  duration: number;
  error?: string;
  segmentCount?: number;
  outputSize?: number;
  encoderUsed?: string;
}

async function testWithRealVideo(
  projectPath: string,
  encoderPreference: 'gpu' | 'cpu' | 'auto'
): Promise<TestResult> {
  const startTime = Date.now();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing with encoder preference: ${encoderPreference}`);
  console.log(`Project: ${projectPath}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Progress tracking
    let lastProgress = 0;
    const onProgress = (progress: number) => {
      const percent = Math.round(progress * 100);
      if (percent > lastProgress) {
        lastProgress = percent;
        console.log(`Progress: ${percent}%`);
      }
    };

    // Run the video creation
    const outputPath = await createFinalVideo(
      projectPath,
      onProgress,
      { encoderPreference }
    );

    const duration = (Date.now() - startTime) / 1000;

    // Get output file stats
    const stats = fs.statSync(outputPath);
    const outputSize = stats.size;

    console.log(`\n✅ Success!`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Output: ${outputPath}`);
    console.log(`Size: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);

    return {
      success: true,
      duration,
      outputSize
    };

  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`\n❌ Failed after ${duration.toFixed(2)}s`);
    console.error(error);

    return {
      success: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runTests() {
  console.log('\n🚀 FinalVideoService Rebuild - Real-World Testing\n');
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Check if 200conongdot project exists
  const projectPath = 'C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot';
  
  if (!fs.existsSync(projectPath)) {
    console.error(`❌ Project not found: ${projectPath}`);
    console.log('\nPlease provide a valid project path with:');
    console.log('- original.mp4 (or .avi)');
    console.log('- dubbed/ folder with audio files');
    console.log('- transcript.srt');
    process.exit(1);
  }

  console.log(`✅ Project found: ${projectPath}\n`);

  // Test scenarios
  const results: Record<string, TestResult> = {};

  // Test 1: Auto mode (GPU priority)
  console.log('\n📋 Test 1: Auto mode (GPU priority with CPU fallback)');
  results.auto = await testWithRealVideo(projectPath, 'auto');

  // Test 2: CPU mode (baseline)
  console.log('\n📋 Test 2: CPU mode (baseline performance)');
  results.cpu = await testWithRealVideo(projectPath, 'cpu');

  // Test 3: GPU mode (if available)
  console.log('\n📋 Test 3: GPU mode (explicit GPU request)');
  results.gpu = await testWithRealVideo(projectPath, 'gpu');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60) + '\n');

  Object.entries(results).forEach(([mode, result]) => {
    const status = result.success ? '✅' : '❌';
    const duration = result.duration.toFixed(2);
    const size = result.outputSize 
      ? `${(result.outputSize / 1024 / 1024).toFixed(2)} MB`
      : 'N/A';

    console.log(`${status} ${mode.toUpperCase()}: ${duration}s | ${size}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  // Performance comparison
  if (results.auto.success && results.cpu.success) {
    const speedup = results.cpu.duration / results.auto.duration;
    console.log(`\n🚀 Speedup (Auto vs CPU): ${speedup.toFixed(2)}x`);
    
    if (speedup >= 5) {
      console.log('✅ Target achieved: 5-10x faster!');
    } else if (speedup >= 2) {
      console.log('⚠️  Good improvement, but below 5x target');
    } else {
      console.log('⚠️  Speedup below expectations');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete!');
  console.log('='.repeat(60) + '\n');
}

// Run tests
runTests().catch(console.error);
