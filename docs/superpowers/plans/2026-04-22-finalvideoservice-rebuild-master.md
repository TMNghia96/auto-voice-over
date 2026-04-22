# FinalVideoService Rebuild - Master Plan

> **For agentic workers:** Use `subagent-driven-development` skill to execute this plan task-by-task.

**Created:** 2026-04-22  
**Design Spec:** `docs/superpowers/specs/2026-04-22-finalvideoservice-rebuild-design.md`  
**Estimated Total Time:** 2-3 days  
**Status:** Ready for execution

---

## Overview

Rebuild FinalVideoService với modular architecture, GPU priority encoding, và parallel processing để đạt 5-10x performance improvement.

**Key Goals:**
- Video render theo actual audio duration
- GPU priority với CPU fallback
- Parallel processing (6 concurrent GPU, 2 concurrent CPU)
- Per-segment slow motion calculation
- User configurable encoder preference

---

## Phase 1: Video Encoders (2-3 hours)

### Phase 1A: Types & Interfaces (15 min)

**Files:**
- `src/services/video/types.ts`
- `src/services/video/encoders/VideoEncoder.ts`
- `tests/services/video/types.test.ts`
- `tests/services/video/encoders/VideoEncoder.test.ts`

**Tasks:**
- [ ] Create EncodeOptions, EncodeResult, ValidatedSegment types
- [ ] Create VideoProcessorConfig with defaults
- [ ] Create VideoEncoder interface
- [ ] Write comprehensive tests

**Key Types:**
```typescript
interface EncodeOptions {
  startTime: number;
  duration: number;
  videoSpeed: number;
  fps: number;
  crf: number;
  preset: string;
}

interface EncodeResult {
  success: boolean;
  outputPath: string;
  fileSize: number;
  duration: number;
  error?: string;
}

interface ValidatedSegment extends Segment {
  adjustedVideoSpeed: number;
  adjustedDuration: number;
  needsSlowMotion: boolean;
}
```

### Phase 1B: GPUEncoder (30 min)

**Files:**
- `src/services/video/encoders/GPUEncoder.ts`
- `tests/services/video/encoders/GPUEncoder.test.ts`

**Tasks:**
- [ ] Implement GPUEncoder class
- [ ] Support AMD (h264_amf) and NVIDIA (h264_nvenc)
- [ ] Test encode to verify GPU availability
- [ ] Apply setpts filter for video speed
- [ ] Write unit tests with mocked FFmpeg

**Key Methods:**
```typescript
class GPUEncoder implements VideoEncoder {
  constructor(gpuType: 'amd' | 'nvidia')
  async isAvailable(): Promise<boolean>
  async encodeSegment(input, output, options): Promise<EncodeResult>
  getEncoderArgs(options): string[]
}
```

### Phase 1C: CPUEncoder (20 min)

**Files:**
- `src/services/video/encoders/CPUEncoder.ts`
- `tests/services/video/encoders/CPUEncoder.test.ts`

**Tasks:**
- [ ] Implement CPUEncoder class
- [ ] Use libx264 codec
- [ ] Support CRF and preset
- [ ] Apply setpts filter
- [ ] Write unit tests

**Key Methods:**
```typescript
class CPUEncoder implements VideoEncoder {
  async isAvailable(): Promise<boolean> // Always true
  async encodeSegment(input, output, options): Promise<EncodeResult>
  getEncoderArgs(options): string[]
}
```

### Phase 1D: EncoderFactory (25 min)

**Files:**
- `src/services/video/encoders/EncoderFactory.ts`
- `tests/services/video/encoders/EncoderFactory.test.ts`

**Tasks:**
- [ ] Implement EncoderFactory class
- [ ] GPU priority: try NVIDIA → AMD → CPU
- [ ] Support user preference (gpu/cpu/auto)
- [ ] Detect GPU via HardwareService
- [ ] Write unit tests

**Key Methods:**
```typescript
class EncoderFactory {
  constructor(preference: 'gpu' | 'cpu' | 'auto')
  async createEncoder(): Promise<VideoEncoder>
  private async detectGPU(): Promise<'amd' | 'nvidia' | null>
}
```

---

## Phase 2: SegmentValidator (1 hour)

**Files:**
- `src/services/video/SegmentValidator.ts`
- `tests/services/video/SegmentValidator.test.ts`

**Tasks:**
- [ ] Implement SegmentValidator class
- [ ] Validate segment timing vs video duration
- [ ] Calculate slow motion based on actual audio duration
- [ ] Handle segments beyond video duration
- [ ] Write comprehensive tests

**Key Logic:**
```typescript
for each segment:
  actualAudioDuration = actualAudioDurations[i]
  originalVideoDuration = segment.videoDuration
  
  // Calculate video speed to match audio
  adjustedVideoSpeed = originalVideoDuration / actualAudioDuration
  
  // Validate bounds
  if (adjustedVideoSpeed < 0.5 || > 2.0):
    log warning
  
  // Handle segments beyond video
  if (segment.videoStart >= videoDuration):
    create freeze frame or black video
```

---

## Phase 3: VideoProcessor (2 hours)

**Files:**
- `src/services/video/VideoProcessor.ts`
- `tests/services/video/VideoProcessor.test.ts`

**Tasks:**
- [ ] Implement VideoProcessor class
- [ ] Parallel segment encoding with p-limit
- [ ] Retry logic (3 attempts, exponential backoff)
- [ ] GPU → CPU fallback per segment
- [ ] Concatenate video segments
- [ ] Mux video with audio
- [ ] Write integration tests

**Key Methods:**
```typescript
class VideoProcessor {
  constructor(encoderFactory, validator, config)
  
  async processVideoSegments(
    segments: ValidatedSegment[],
    originalVideo: string,
    tempDir: string,
    onProgress: (progress: number) => void
  ): Promise<string[]>
  
  async concatenateVideo(segmentPaths, outputPath): Promise<boolean>
  async muxWithAudio(videoPath, audioPath, outputPath): Promise<boolean>
  
  private async encodeSegmentWithRetry(
    encoder, segment, index, originalVideo, tempDir
  ): Promise<EncodeResult>
}
```

**Concurrency:**
- GPU: 6 concurrent encodes
- CPU: 2 concurrent encodes
- Dynamic based on encoder type

---

## Phase 4: Audio Extraction (1 hour)

### Phase 4A: AudioSegmentBuilder

**Files:**
- `src/services/audio/AudioSegmentBuilder.ts`
- `tests/services/audio/AudioSegmentBuilder.test.ts`

**Tasks:**
- [ ] Extract buildSegmentMap from FinalVideoService
- [ ] Move to AudioSegmentBuilder class
- [ ] Keep logic unchanged
- [ ] Write tests

### Phase 4B: AudioProcessor

**Files:**
- `src/services/audio/AudioProcessor.ts`
- `tests/services/audio/AudioProcessor.test.ts`

**Tasks:**
- [ ] Extract audio processing logic from FinalVideoService
- [ ] Move to AudioProcessor class
- [ ] Keep logic unchanged (đang hoạt động tốt)
- [ ] Return actualDurations array
- [ ] Write tests

**Key Methods:**
```typescript
class AudioProcessor {
  async processAudioSegments(
    segments, fullAudioWav, tempDir, onProgress
  ): Promise<{
    segmentPaths: string[],
    actualDurations: number[]
  }>
  
  async concatenateAudio(segmentPaths, tempDir): Promise<string>
}
```

---

## Phase 5: FinalVideoService Refactor (2 hours)

**Files:**
- `src/services/FinalVideoService.ts` (refactor to ~200 lines)
- `tests/services/FinalVideoService.integration.test.ts`

**Tasks:**
- [ ] Refactor to orchestrator pattern
- [ ] Use AudioSegmentBuilder
- [ ] Use AudioProcessor
- [ ] Use SegmentValidator
- [ ] Use VideoProcessor
- [ ] Update progress reporting
- [ ] Update error handling
- [ ] Write integration tests

**New Flow:**
```typescript
export const createFinalVideo = async (
  projectPath, onProgress, config
) => {
  // 1. Setup
  const originalVideo = findOriginalVideo(projectPath);
  const tempDir = path.join(projectPath, 'temp_final');
  
  // 2. Build segment map
  const segmentBuilder = new AudioSegmentBuilder();
  const segments = await segmentBuilder.buildSegmentMap(...);
  
  // 3. Process audio (giữ nguyên logic)
  const audioProcessor = new AudioProcessor();
  const audioResult = await audioProcessor.processAudioSegments(...);
  const finalAudioWav = await audioProcessor.concatenateAudio(...);
  
  // 4. Validate segments dựa trên ACTUAL audio
  const validator = new SegmentValidator();
  const validatedSegments = validator.validateAndAdjust(
    segments,
    audioResult.actualDurations, // KEY: actual, not expected
    videoDuration
  );
  
  // 5. Process video
  const encoderFactory = new EncoderFactory(config?.encoderPreference || 'auto');
  const videoProcessor = new VideoProcessor(encoderFactory, validator, config);
  const videoSegmentPaths = await videoProcessor.processVideoSegments(...);
  
  // 6. Concatenate video
  const mergedVideo = await videoProcessor.concatenateVideo(...);
  
  // 7. Mux final
  await videoProcessor.muxWithAudio(mergedVideo, finalAudioWav, outputPath);
  
  return outputPath;
}
```

---

## Phase 6: Integration Testing (1 hour)

**Files:**
- `tests/integration/finalvideo-full.test.ts`

**Tasks:**
- [ ] Test với small video (10 segments)
- [ ] Test GPU encoding
- [ ] Test CPU fallback
- [ ] Test error scenarios
- [ ] Test với 200conongdot project (349 segments)
- [ ] Verify performance improvement
- [ ] Verify no frozen frames
- [ ] Verify audio sync

---

## Success Criteria

- [ ] All 349 segments encode successfully
- [ ] Render time < 5 minutes (GPU) or < 10 minutes (CPU)
- [ ] Video sync với audio hoàn hảo (< 0.1s drift)
- [ ] GPU encoding works với AMD và NVIDIA
- [ ] CPU fallback works khi GPU fails
- [ ] No frozen frames
- [ ] Code modular và testable
- [ ] All tests pass
- [ ] Performance: 5-10x faster than current

---

## Execution Strategy

**Use subagent-driven-development:**

1. Execute Phase 1A → Review → Continue
2. Execute Phase 1B → Review → Continue
3. Execute Phase 1C → Review → Continue
4. Execute Phase 1D → Review → Continue
5. Execute Phase 2 → Review → Continue
6. Execute Phase 3 → Review → Continue
7. Execute Phase 4A → Review → Continue
8. Execute Phase 4B → Review → Continue
9. Execute Phase 5 → Review → Continue
10. Execute Phase 6 → Final verification

**Each subagent receives:**
- This master plan
- Design spec
- Current phase description
- Fresh context for implementation

---

## Notes

- **TDD approach**: Test first, implement, verify, commit
- **Frequent commits**: After each phase completion
- **GPU priority**: Always try GPU first, fallback to CPU
- **No changes to audio logic**: Audio processing đang hoạt động tốt
- **Video follows audio**: Video render theo actual audio duration

---

**End of Master Plan**
