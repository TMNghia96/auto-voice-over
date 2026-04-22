# FinalVideoService Rebuild - Design Specification

**Ngày**: 2026-04-22  
**Tác giả**: OpenCode AI  
**Trạng thái**: Approved  
**Approach**: Modular Refactor với Parallel Processing (Approach A)

---

## 1. Tổng Quan

### 1.1 Mục Tiêu

Rebuild FinalVideoService để:
- **Performance**: 5-10x nhanh hơn (2-5 phút thay vì 17-29 phút)
- **Reliability**: Handle edge cases, retry logic, graceful degradation
- **Maintainability**: Modular architecture, clean code, testable
- **Quality**: Ưu tiên GPU encoding, balance speed & quality

### 1.2 Scope

**In Scope:**
- ✅ Rebuild video processing module
- ✅ Parallel processing với GPU priority
- ✅ Segment validation và slow motion calculation
- ✅ Retry logic và error handling
- ✅ User configurable encoder preference

**Out of Scope:**
- ❌ Audio processing (giữ nguyên logic hiện tại)
- ❌ Caching system (future enhancement)
- ❌ Incremental rendering (future enhancement)
- ❌ Preview mode (future enhancement)

### 1.3 Key Requirements

1. **Video render theo actual audio duration** - Video tự động slow down để match audio đã xử lý
2. **GPU priority** - Ưu tiên GPU encoding, fallback to CPU nếu fail
3. **Parallel processing** - 6 concurrent GPU encodes, 2 concurrent CPU
4. **Per-segment slow motion** - Mỗi segment tự tính slow motion riêng
5. **User configurable** - Settings cho encoder preference (GPU/CPU/Auto)

---

## 2. Architecture

### 2.1 Module Structure

```
src/services/
├─ FinalVideoService.ts (orchestrator, ~200 lines)
│  └─ Main entry point, coordinates audio + video processing
│
├─ audio/ (giữ nguyên logic hiện tại)
│  ├─ AudioProcessor.ts (~300 lines)
│  │  ├─ processAudioSegments()
│  │  ├─ concatenateAudio()
│  │  └─ trackDrift()
│  │
│  └─ AudioSegmentBuilder.ts (~150 lines)
│     └─ buildSegmentMap() - moved from FinalVideoService
│
└─ video/ (NEW - core rebuild)
   ├─ VideoProcessor.ts (~200 lines)
   │  ├─ processVideoSegments()
   │  ├─ concatenateVideo()
   │  └─ muxWithAudio()
   │
   ├─ encoders/
   │  ├─ VideoEncoder.ts (interface, ~50 lines)
   │  ├─ GPUEncoder.ts (~100 lines)
   │  ├─ CPUEncoder.ts (~80 lines)
   │  └─ EncoderFactory.ts (~100 lines)
   │
   ├─ SegmentValidator.ts (~150 lines)
   │  ├─ validateSegmentTiming()
   │  ├─ calculateSlowMotion()
   │  └─ adjustSegmentForVideo()
   │
   └─ types.ts (~50 lines)
      └─ Shared types and interfaces
```

### 2.2 Data Flow

```
1. FinalVideoService.createFinalVideo()
   ↓
2. AudioSegmentBuilder.buildSegmentMap()
   → Returns: Segment[]
   ↓
3. AudioProcessor.processAudioSegments()
   → Process in parallel (existing logic)
   → Returns: {segmentPaths, actualDurations}
   ↓
4. AudioProcessor.concatenateAudio()
   → Returns: final audio file
   ↓
5. SegmentValidator.validateAndAdjust()
   → Validates timing, calculates slow motion based on ACTUAL audio
   → Returns: ValidatedSegment[]
   ↓
6. VideoProcessor.processVideoSegments()
   → Process in parallel with GPU priority
   → Returns: video segment files
   ↓
7. VideoProcessor.concatenateVideo()
   → Returns: merged video file
   ↓
8. VideoProcessor.muxWithAudio()
   → Returns: final output file
```

**Key Point**: Video rendering dựa trên **actual audio duration** sau khi xử lý, không phải expected duration.

---

## 3. Core Components

### 3.1 VideoProcessor

**Trách nhiệm:**
- Điều phối video processing pipeline
- Quản lý parallel encoding
- Handle retry logic
- Concatenate và mux

**Interface:**
```typescript
class VideoProcessor {
  constructor(
    private encoderFactory: EncoderFactory,
    private validator: SegmentValidator,
    private config: VideoProcessorConfig
  )

  async processVideoSegments(
    segments: ValidatedSegment[],
    originalVideo: string,
    tempDir: string,
    onProgress: (progress: number) => void
  ): Promise<string[]>

  async concatenateVideo(
    segmentPaths: string[],
    outputPath: string
  ): Promise<boolean>

  async muxWithAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<boolean>
}
```

**Config:**
```typescript
interface VideoProcessorConfig {
  concurrency: number;        // 6 for GPU, 2 for CPU
  maxRetries: number;          // 3 retries per segment
  retryDelay: number;          // 1000ms base delay
  encoderPreference: 'gpu' | 'cpu' | 'auto';
}

const DEFAULT_CONFIG: VideoProcessorConfig = {
  concurrency: 6,
  maxRetries: 3,
  retryDelay: 1000,
  encoderPreference: 'auto'  // GPU first, CPU fallback
}
```

### 3.2 SegmentValidator

**Trách nhiệm:**
- Validate segment timing
- Calculate slow motion adjustments dựa trên actual audio
- Adjust segments để fit video duration

**Interface:**
```typescript
class SegmentValidator {
  validateAndAdjust(
    segments: Segment[],
    actualAudioDurations: number[],
    videoDuration: number
  ): ValidatedSegment[]
}

interface ValidatedSegment extends Segment {
  adjustedVideoSpeed: number;  // Calculated slow motion
  adjustedDuration: number;     // Actual duration to encode
  needsSlowMotion: boolean;     // Flag for logging
}
```

**Logic tính slow motion:**
```typescript
for each segment:
  actualAudioDuration = actualAudioDurations[i]
  originalVideoDuration = segment.videoDuration
  
  // Calculate video speed để match audio
  adjustedVideoSpeed = originalVideoDuration / actualAudioDuration
  
  // Validate bounds
  if (adjustedVideoSpeed < 0.5):
    log warning "Video quá chậm"
  
  if (adjustedVideoSpeed > 2.0):
    log warning "Video quá nhanh"
  
  // Handle segments beyond video duration
  if (segment.videoStart >= videoDuration):
    // Tạo freeze frame hoặc black video
    adjustedVideoSpeed = 1.0
    adjustedDuration = actualAudioDuration
  else if (segment.videoEnd > videoDuration):
    // Adjust để fit
    availableDuration = videoDuration - segment.videoStart
    adjustedVideoSpeed = availableDuration / actualAudioDuration
```

### 3.3 Encoder System

**VideoEncoder Interface:**
```typescript
interface VideoEncoder {
  readonly name: string;
  readonly type: 'gpu' | 'cpu';
  
  isAvailable(): Promise<boolean>;
  
  encodeSegment(
    inputVideo: string,
    outputPath: string,
    options: EncodeOptions
  ): Promise<EncodeResult>;
  
  getEncoderArgs(options: EncodeOptions): string[];
}

interface EncodeOptions {
  startTime: number;
  duration: number;
  videoSpeed: number;  // For setpts filter
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
```

**GPUEncoder:**
```typescript
class GPUEncoder implements VideoEncoder {
  constructor(private gpuType: 'amd' | 'nvidia')
  
  async isAvailable(): Promise<boolean> {
    // Test encode 1 frame để verify GPU works
  }
  
  getEncoderArgs(options: EncodeOptions): string[] {
    if (this.gpuType === 'amd') {
      return [
        '-c:v', 'h264_amf',
        '-quality', 'quality',
        '-rc', 'cqp',
        '-qp_i', '20', '-qp_p', '20'
      ];
    } else {
      return [
        '-c:v', 'h264_nvenc',
        '-preset', 'p4',
        '-rc', 'vbr',
        '-cq', '20'
      ];
    }
  }
}
```

**CPUEncoder:**
```typescript
class CPUEncoder implements VideoEncoder {
  getEncoderArgs(options: EncodeOptions): string[] {
    return [
      '-c:v', 'libx264',
      '-crf', options.crf.toString(),
      '-preset', options.preset
    ];
  }
}
```

**EncoderFactory - GPU Priority:**
```typescript
class EncoderFactory {
  constructor(private preference: 'gpu' | 'cpu' | 'auto')
  
  async createEncoder(): Promise<VideoEncoder> {
    if (preference === 'cpu') {
      return new CPUEncoder();
    }
    
    // GPU first (cho cả 'gpu' và 'auto' mode)
    const gpu = await this.detectGPU();
    if (gpu) {
      const encoder = new GPUEncoder(gpu);
      if (await encoder.isAvailable()) {
        console.log(`[Encoder] Using GPU: ${gpu}`);
        return encoder;
      }
      console.warn('[Encoder] GPU detected but not available, falling back to CPU');
    }
    
    console.log('[Encoder] Using CPU encoder');
    return new CPUEncoder();
  }
  
  private async detectGPU(): Promise<'amd' | 'nvidia' | null> {
    const hwInfo = await getHardwareInfo();
    if (hwInfo.hasAmdGpu) return 'amd';
    if (hwInfo.hasNvidiaGpu) return 'nvidia';
    return null;
  }
}
```

---

## 4. Implementation Details

### 4.1 Main Flow

```typescript
export const createFinalVideo = async (
  projectPath: string,
  onProgress: (p: FinalVideoProgress) => void,
  config?: Partial<VideoProcessorConfig>
): Promise<string | null> => {
  
  // 1. Setup
  const originalVideo = findOriginalVideo(projectPath);
  const originalSrt = findOriginalSrt(projectPath);
  const audioDir = path.join(projectPath, 'audio_gene');
  const tempDir = path.join(projectPath, 'temp_final');
  
  // 2. Build segment map
  const segmentBuilder = new AudioSegmentBuilder();
  const segments = await segmentBuilder.buildSegmentMap(
    srtContent, 
    audioDir, 
    videoDuration
  );
  
  // 3. Process audio (giữ nguyên logic hiện tại)
  const audioProcessor = new AudioProcessor();
  const audioResult = await audioProcessor.processAudioSegments(
    segments,
    fullAudioWav,
    tempDir,
    (progress) => onProgress({...progress, status: 'processing'})
  );
  
  const finalAudioWav = await audioProcessor.concatenateAudio(
    audioResult.segmentPaths,
    tempDir
  );
  
  // 4. Validate và adjust segments dựa trên ACTUAL audio
  const validator = new SegmentValidator();
  const validatedSegments = validator.validateAndAdjust(
    segments,
    audioResult.actualDurations, // KEY: Dùng actual, không phải expected
    videoDuration
  );
  
  // 5. Process video với validated segments
  const encoderFactory = new EncoderFactory(
    config?.encoderPreference || 'auto'
  );
  const videoProcessor = new VideoProcessor(
    encoderFactory,
    validator,
    config || DEFAULT_CONFIG
  );
  
  const videoSegmentPaths = await videoProcessor.processVideoSegments(
    validatedSegments,
    originalVideo,
    tempDir,
    (progress) => onProgress({...progress, status: 'rerendering'})
  );
  
  // 6. Concatenate video
  const mergedVideo = await videoProcessor.concatenateVideo(
    videoSegmentPaths,
    path.join(tempDir, 'merged_video.mp4')
  );
  
  // 7. Mux final
  const outputPath = path.join(projectPath, 'final', 'final_video.mp4');
  await videoProcessor.muxWithAudio(
    mergedVideo,
    finalAudioWav,
    outputPath
  );
  
  return outputPath;
}
```

### 4.2 Parallel Processing

```typescript
async processVideoSegments(
  segments: ValidatedSegment[],
  originalVideo: string,
  tempDir: string,
  onProgress: (progress: number) => void
): Promise<string[]> {
  
  // 1. Create encoder
  const encoder = await this.encoderFactory.createEncoder();
  const concurrency = encoder.type === 'gpu' ? 6 : 2;
  const limit = pLimit(concurrency);
  
  console.log(`[VideoProcessor] Using ${encoder.name}, concurrency: ${concurrency}`);
  
  // 2. Encode segments in parallel
  const encodePromises = segments.map((seg, i) =>
    limit(async () => {
      const result = await this.encodeSegmentWithRetry(
        encoder,
        seg,
        i,
        originalVideo,
        tempDir
      );
      
      const progress = 60 + Math.round(((i + 1) / segments.length) * 25);
      onProgress(progress);
      
      return result;
    })
  );
  
  const results = await Promise.all(encodePromises);
  
  // 3. Validate all succeeded
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    throw new Error(`${failed.length} segments failed to encode`);
  }
  
  return results.map(r => r.outputPath);
}
```

### 4.3 Retry Logic

```typescript
private async encodeSegmentWithRetry(
  encoder: VideoEncoder,
  segment: ValidatedSegment,
  index: number,
  originalVideo: string,
  tempDir: string
): Promise<EncodeResult> {
  
  const outputPath = path.join(
    tempDir, 
    `segment_${String(index).padStart(4, '0')}.mp4`
  );
  
  let lastError: string = '';
  let usedCPUFallback = false;
  
  for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
    try {
      const options: EncodeOptions = {
        startTime: segment.videoStart,
        duration: segment.adjustedDuration,
        videoSpeed: segment.adjustedVideoSpeed,
        fps: await getVideoFps(originalVideo),
        crf: 18,
        preset: encoder.type === 'gpu' ? 'fast' : 'ultrafast'
      };
      
      const result = await encoder.encodeSegment(
        originalVideo,
        outputPath,
        options
      );
      
      if (result.success && result.fileSize > 1000) {
        console.log(`[Segment ${index}] ✓ ${encoder.name}: ${(result.fileSize / 1024).toFixed(1)}KB`);
        return result;
      }
      
      lastError = result.error || 'File too small';
      
      // GPU failed on first attempt → try CPU immediately
      if (attempt === 1 && encoder.type === 'gpu' && !usedCPUFallback) {
        console.warn(`[Segment ${index}] GPU failed, trying CPU...`);
        const cpuEncoder = new CPUEncoder();
        const cpuResult = await cpuEncoder.encodeSegment(
          originalVideo,
          outputPath,
          options
        );
        
        if (cpuResult.success && cpuResult.fileSize > 1000) {
          usedCPUFallback = true;
          console.log(`[Segment ${index}] ✓ CPU fallback: ${(cpuResult.fileSize / 1024).toFixed(1)}KB`);
          return cpuResult;
        }
      }
      
    } catch (error: any) {
      lastError = error.message;
    }
    
    // Wait before retry (exponential backoff)
    if (attempt < this.config.maxRetries) {
      await sleep(this.config.retryDelay * attempt);
      console.log(`[Segment ${index}] Retry ${attempt + 1}/${this.config.maxRetries}...`);
    }
  }
  
  throw new Error(`Segment ${index} failed after ${this.config.maxRetries} attempts: ${lastError}`);
}
```

### 4.4 Error Handling

**Strategy:**
1. **Segment-level errors** → Retry 3 lần với exponential backoff
2. **GPU errors** → Fallback to CPU ngay lập tức
3. **Critical errors** → Stop toàn bộ pipeline, cleanup temp files
4. **Partial failures** → Log chi tiết, continue với segments còn lại

**Error types:**
```typescript
class VideoProcessingError extends Error {
  constructor(
    message: string,
    public segmentIndex?: number,
    public phase?: 'encode' | 'concat' | 'mux'
  ) {
    super(message);
  }
}
```

---

## 5. Performance Expectations

### 5.1 Current Performance

- **349 segments** × 3-5s = **17-29 minutes**
- Sequential processing
- CPU encoding only
- No retry logic

### 5.2 Target Performance

**With GPU (6 concurrent):**
- 349 segments ÷ 6 parallel × 1-2s = **2-3 minutes**
- **Improvement: 8-10x faster**

**With CPU fallback (2 concurrent):**
- 349 segments ÷ 2 parallel × 2-3s = **5-9 minutes**
- **Improvement: 3-5x faster**

### 5.3 Memory Usage

- **Current**: ~2GB (sequential)
- **Target**: ~4-6GB (6 concurrent GPU encodes)
- **Minimum requirement**: 4GB free RAM

---

## 6. Testing Strategy

### 6.1 Unit Tests

- SegmentValidator.validateAndAdjust()
- EncoderFactory.createEncoder()
- Slow motion calculation logic
- Retry logic

### 6.2 Integration Tests

- End-to-end với test video (10 segments)
- GPU encoder availability
- CPU fallback scenario
- Error handling

### 6.3 Performance Tests

- Benchmark GPU vs CPU
- Measure parallel speedup
- Memory usage monitoring
- 349 segments full render test

---

## 7. Migration Plan

### 7.1 Phase 1: Create New Modules

1. Create `src/services/video/` directory
2. Implement VideoEncoder interface
3. Implement GPUEncoder và CPUEncoder
4. Implement EncoderFactory
5. Implement SegmentValidator
6. Implement VideoProcessor

### 7.2 Phase 2: Extract Audio Logic

1. Create `src/services/audio/` directory
2. Move audio processing logic to AudioProcessor
3. Move segment building to AudioSegmentBuilder
4. Update imports

### 7.3 Phase 3: Refactor FinalVideoService

1. Update FinalVideoService to use new modules
2. Remove old video processing code
3. Update progress reporting
4. Update error handling

### 7.4 Phase 4: Testing

1. Unit tests for new modules
2. Integration tests
3. Performance benchmarks
4. Test với 200conongdot project (349 segments)

### 7.5 Phase 5: Cleanup

1. Remove old code
2. Update documentation
3. Commit changes

---

## 8. Success Criteria

- [ ] All 349 segments encode successfully
- [ ] Render time < 5 minutes (GPU) hoặc < 10 minutes (CPU)
- [ ] Video sync với audio hoàn hảo (< 0.1s drift)
- [ ] GPU encoding works với AMD và NVIDIA
- [ ] CPU fallback works khi GPU fails
- [ ] No frozen frames
- [ ] Code modular và testable
- [ ] All tests pass

---

## 9. Future Enhancements

**Not in current scope, but possible later:**

1. **Caching System**
   - Cache encoded segments by hash
   - Reuse unchanged segments
   - 10-100x faster for re-renders

2. **Incremental Rendering**
   - Detect what changed
   - Only re-encode changed segments

3. **Preview Mode**
   - Low quality, fast preview
   - 720p, CRF 28, ultrafast
   - ~30s for full preview

4. **Progress Estimation**
   - Estimate time remaining
   - Show current encoder
   - Detailed segment progress

---

**End of Design Specification**
