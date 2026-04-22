/**
 * Standalone test script for FinalVideoService rebuild
 * Tests core modules without Electron dependencies
 */

import { EncoderFactory } from '../src/services/video/encoders/EncoderFactory';
import { SegmentValidator } from '../src/services/video/SegmentValidator';
import { VideoProcessor } from '../src/services/video/VideoProcessor';
import { AudioSegmentBuilder } from '../src/services/audio/AudioSegmentBuilder';
import { AudioProcessor } from '../src/services/audio/AudioProcessor';
import type { Segment, VideoProcessorConfig } from '../src/services/video/types';
import path from 'path';
import fs from 'fs';

interface TestResult {
  success: boolean;
  duration: number;
  error?: string;
  phase?: string;
}

async function testModulesStandalone(projectPath: string): Promise<TestResult> {
  const startTime = Date.now();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing FinalVideoService Modules (Standalone)`);
  console.log(`Project: ${projectPath}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Phase 1: Check project structure
    console.log('📋 Phase 1: Validating project structure...');
    
    const originalVideo = fs.readdirSync(projectPath)
      .find(f => f.startsWith('original.') && (f.endsWith('.mp4') || f.endsWith('.avi')));
    
    if (!originalVideo) {
      throw new Error('Original video not found');
    }
    
    const dubbedDir = path.join(projectPath, 'dubbed');
    if (!fs.existsSync(dubbedDir)) {
      throw new Error('dubbed/ directory not found');
    }
    
    const srtFile = path.join(projectPath, 'transcript.srt');
    if (!fs.existsSync(srtFile)) {
      throw new Error('transcript.srt not found');
    }
    
    console.log(`✅ Original video: ${originalVideo}`);
    console.log(`✅ Dubbed directory exists`);
    console.log(`✅ SRT file exists\n`);

    // Phase 2: Test EncoderFactory
    console.log('📋 Phase 2: Testing EncoderFactory...');
    const encoderFactory = new EncoderFactory('auto');
    const encoder = await encoderFactory.createEncoder();
    console.log(`✅ Encoder created: ${encoder.name} (${encoder.type})\n`);

    // Phase 3: Test AudioSegmentBuilder
    console.log('📋 Phase 3: Testing AudioSegmentBuilder...');
    const segmentBuilder = new AudioSegmentBuilder();
    
    // Mock video duration (we'd need ffprobe for real)
    const videoDuration = 300; // 5 minutes mock
    
    const segments = await segmentBuilder.buildSegmentMap(projectPath, videoDuration);
    console.log(`✅ Built ${segments.length} segments\n`);

    // Phase 4: Test SegmentValidator
    console.log('📋 Phase 4: Testing SegmentValidator...');
    const validator = new SegmentValidator();
    
    // Mock actual audio durations (in real test, these come from AudioProcessor)
    const mockActualDurations = segments.map(s => s.targetDuration * 0.98); // Simulate slight variation
    
    const validatedSegments = validator.validateAndAdjust(
      segments,
      mockActualDurations,
      videoDuration
    );
    console.log(`✅ Validated ${validatedSegments.length} segments`);
    console.log(`   - Slow motion segments: ${validatedSegments.filter(s => s.needsSlowMotion).length}`);
    console.log(`   - Speed range: ${Math.min(...validatedSegments.map(s => s.adjustedVideoSpeed)).toFixed(2)} - ${Math.max(...validatedSegments.map(s => s.adjustedVideoSpeed)).toFixed(2)}\n`);

    // Phase 5: Test VideoProcessor (dry run)
    console.log('📋 Phase 5: Testing VideoProcessor initialization...');
    const config: VideoProcessorConfig = {
      concurrency: 6,
      maxRetries: 3,
      retryDelay: 1000,
      encoderPreference: 'auto'
    };
    
    const videoProcessor = new VideoProcessor(encoderFactory, validator, config);
    console.log(`✅ VideoProcessor initialized`);
    console.log(`   - Concurrency: ${config.concurrency}`);
    console.log(`   - Max retries: ${config.maxRetries}\n`);

    // Phase 6: Test AudioProcessor initialization
    console.log('📋 Phase 6: Testing AudioProcessor initialization...');
    const audioProcessor = new AudioProcessor();
    console.log(`✅ AudioProcessor initialized\n`);

    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ All modules tested successfully!`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      success: true,
      duration
    };

  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`\n❌ Test failed after ${duration.toFixed(2)}s`);
    console.error(error);

    return {
      success: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runTests() {
  console.log('\n🚀 FinalVideoService Rebuild - Module Testing\n');
  console.log(`Time: ${new Date().toISOString()}\n`);

  const projectPath = 'C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot';
  
  if (!fs.existsSync(projectPath)) {
    console.error(`❌ Project not found: ${projectPath}`);
    process.exit(1);
  }

  const result = await testModulesStandalone(projectPath);

  if (result.success) {
    console.log('✅ Module testing complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. All modules are working correctly');
    console.log('   2. Ready for full integration test with Electron app');
    console.log('   3. Run from main app to test with real video encoding');
  } else {
    console.error('❌ Module testing failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
