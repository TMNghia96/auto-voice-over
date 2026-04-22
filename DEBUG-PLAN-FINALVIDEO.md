# Phân tích Luồng Hoạt Động FinalVideoService - Debug Plan

**Ngày phân tích**: 2026-04-21 16:41 UTC  
**Mục đích**: Tìm vấn đề render còn sót sau khi fix 3 bugs

---

## 📊 LUỒNG HOẠT ĐỘNG TỔNG QUAN

```
┌─────────────────────────────────────────────────────────────┐
│                    createFinalVideo()                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 0: KHỞI TẠO & VALIDATION                               │
│ - Tìm original video, SRT, audio directory                  │
│ - Detect hardware (AMD/NVIDIA GPU)                          │
│ - Get video duration, FPS                                   │
│ - Parse SRT → entries                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 1: BUILD SEGMENT MAP                                   │
│ - buildSegmentMap(srtContent, audioDir, videoDuration)      │
│ - Tạo segments[] array với timing & speed calculations      │
│ - Mỗi segment có: videoStart, videoEnd, targetDuration,     │
│   audioSpeed, videoSpeed                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 2: CHUẨN BỊ FULL AUDIO                                 │
│ - Extract/create fullAudioWav (44.1kHz, stereo, PCM)        │
│ - Từ external audio HOẶC video audio HOẶC silence           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 3: XỬ LÝ AUDIO SEGMENTS (PARALLEL)                     │
│ - processAudioSegment() cho mỗi segment                     │
│ - Với CONCURRENCY = 2-4 (dynamic based on RAM)              │
│                                                              │
│ Cho mỗi segment:                                             │
│   - Gap segment: Extract + fade volume                      │
│   - Dubbed segment: Mix background + dubbed audio           │
│   - Output: audio_seg_XXXX.wav                              │
│   - Track timing: actualDuration vs targetDuration          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 4: CONCAT AUDIO                                         │
│ - Concat tất cả audio_seg_*.wav → final_mixed_audio.wav     │
│ - Verify total duration vs expected                         │
│ - Calculate cumulative drift                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 5: VIDEO PROCESSING                                     │
│                                                              │
│ IF segments.length > 30:                                    │
│   ┌──────────────────────────────────────────────────────┐ │
│   │ BATCH PROCESSING PATH                                 │ │
│   │ - Chia thành batches (30 segments/batch)             │ │
│   │ - Mỗi batch:                                          │ │
│   │   1. Build filter script (trim + setpts + fps)       │ │
│   │   2. Encode batch video (GPU/CPU)                    │ │
│   │   3. Save batch_video_XXX.mp4                        │ │
│   │ - Merge all batches (concat demuxer)                 │ │
│   │ - Mux audio vào merged video                         │ │
│   └──────────────────────────────────────────────────────┘ │
│ ELSE:                                                        │
│   ┌──────────────────────────────────────────────────────┐ │
│   │ SINGLE-PASS PATH                                      │ │
│   │ - Build filter script cho tất cả segments            │ │
│   │ - Encode video với audio (1 pass)                    │ │
│   │ - Hardware encoder + fallback                        │ │
│   └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 6: CLEANUP & RETURN                                     │
│ - Cleanup temp files                                        │
│ - Return output path                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 CHI TIẾT TỪNG BƯỚC

### BƯỚC 1: buildSegmentMap() - Line 230-328

**Input**: 
- srtContent (string)
- audioDir (path)
- totalVideoDuration (number)

**Process**:
```typescript
for each SRT entry:
  1. Parse timing: startTime, endTime
  2. Check for gap before this entry
     → Create gap segment if gap > 0.05s
  
  3. For dubbed segment:
     - Find audio file: XXXX.mp3
     - Get audioDuration
     - Calculate speed:
       * ratio = audioDuration / originalDuration
       * if ratio > MAX_AUDIO_SPEEDUP (1.4):
           audioSpeed = 1.4
           targetDuration = audioDuration / 1.4
           videoSpeed = targetDuration / originalDuration
       * else if ratio > 1.0:
           audioSpeed = ratio
           targetDuration = originalDuration
           videoSpeed = 1.0
       * else:
           audioSpeed = 1.0
           targetDuration = originalDuration
           videoSpeed = 1.0
  
  4. Add segment to array

5. Check for final gap after last entry
6. Mark fade flags for gap segments
```

**Output**: 
```typescript
segments: Segment[] = [
  {
    type: 'dubbed',
    index: 1,
    videoStart: 0,
    videoEnd: 5.234,
    videoDuration: 5.234,
    audioPath: 'audio_gene/0001.mp3',
    audioDuration: 5.8,
    targetDuration: 5.234,  // ← QUAN TRỌNG
    audioSpeed: 1.108,
    videoSpeed: 1.0
  },
  // ... 349 segments
]
```

**⚠️ POTENTIAL ISSUE #1**: 
- `targetDuration` calculation có thể sai
- `videoSpeed` calculation có thể sai
- Nếu sai → video bị stretch/compress sai → frozen frames

---

### BƯỚC 3: processAudioSegment() - Line 436-591

**Cho Gap Segment**:
```typescript
1. Extract audio chunk từ fullAudioWav
   FFmpeg: -ss ${start} -t ${duration} -i fullAudioWav
   
2. Apply fade volume:
   -af volume='${fadeExpression}'
   
3. Output: audio_seg_XXXX.wav
4. Measure actualDuration
5. Track drift: actualDuration - targetDuration
```

**Cho Dubbed Segment**:
```typescript
1. Extract background audio chunk
   FFmpeg: -ss ${start} -t ${videoDuration} -i fullAudioWav
   
2. Mix với dubbed audio:
   [0:a] → background (với atempo + volume duck)
   [1:a] → dubbed audio (với atempo)
   amix → output
   
3. Apply -t ${targetDuration} để crop chính xác
4. Output: audio_seg_XXXX.wav
5. Measure actualDuration
6. Track drift
```

**⚠️ POTENTIAL ISSUE #2**:
- `atempo` filter có thể không chính xác
- `-t ${targetDuration}` có thể crop sai
- `actualDuration` có thể khác `targetDuration` → drift tích lũy

---

### BƯỚC 4: Concat Audio - Line 638-665

```typescript
1. Create concat list file:
   file 'audio_seg_0000.wav'
   file 'audio_seg_0001.wav'
   ...
   
2. FFmpeg concat:
   -f concat -safe 0 -i list.txt -c:a copy final_mixed_audio.wav
   
3. Measure totalActual vs totalExpected
4. Log drift warning if > 0.1s
```

**⚠️ POTENTIAL ISSUE #3**:
- Nếu có drift tích lũy → audio không match video length
- Khi mux vào video → sync issue

---

### BƯỚC 5A: Batch Video Processing - Line 703-828

**Cho mỗi batch**:
```typescript
1. Build filter script:
   for each segment in batch:
     filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`
     
     if (totalVideoSpeed !== 1.0):
       filterStr += `,setpts=${ptsMultiplier}*PTS`
     
     filterStr += `,fps=${fps}[v${i}]`
   
   concat: [v0][v1]...[vN]concat=n=N:v=1:a=0,format=yuv420p[outv]

2. Encode batch:
   FFmpeg:
     -i originalVideo
     -filter_complex_script batch_filter.txt
     -map [outv]
     ...HW_VIDEO_ARGS (GPU)
     -an (no audio)
     batch_video_XXX.mp4

3. Fallback to CPU if GPU fails
```

**⚠️ POTENTIAL ISSUE #4**:
- `trim` filter với non-keyframe positions → frame loss
- `setpts` calculation sai → frozen frames
- `actualSegmentDuration` không match `targetDuration` → video length sai

**Merge batches**:
```typescript
1. Create concat list:
   file 'batch_video_000.mp4'
   file 'batch_video_001.mp4'
   ...

2. FFmpeg concat:
   -f concat -safe 0 -i list.txt -c:v copy merged_video.mp4
```

**⚠️ POTENTIAL ISSUE #5**:
- Batch videos có length khác nhau
- Khi concat → discontinuity → glitches

**Mux audio**:
```typescript
FFmpeg:
  -i merged_video.mp4
  -i final_mixed_audio.wav
  -c:v copy
  -c:a aac
  -map 0:v:0
  -map 1:a:0
  final_video.mp4
```

**⚠️ POTENTIAL ISSUE #6**:
- Video length ≠ Audio length → sync issue
- FFmpeg sẽ pad/truncate → frozen frames hoặc cut audio

---

### BƯỚC 5B: Single-Pass Processing - Line 830-940

```typescript
1. Build filter script cho TẤT CẢ segments:
   [v0][v1]...[v348]concat=n=349:v=1:a=0[outv]

2. Encode:
   FFmpeg:
     -i originalVideo
     -i final_mixed_audio.wav
     -filter_complex_script filter.txt
     -map [outv]
     -map 1:a:0
     ...HW_VIDEO_ARGS
     final_video.mp4
```

**⚠️ POTENTIAL ISSUE #7**:
- Filter graph quá phức tạp (đã fix với batch)
- Nhưng logic tính toán vẫn giống batch → có thể sai

---

## 🐛 CÁC VẤN ĐỀ CÓ THỂ CÒN TỒN TẠI

### Issue #1: targetDuration Calculation (BƯỚC 1)

**Vấn đề**:
```typescript
// Line 270-288
if (audioDuration > 0) {
    const ratio = audioDuration / originalDuration;
    if (ratio > MAX_AUDIO_SPEEDUP) {
        audioSpeed = MAX_AUDIO_SPEEDUP;
        targetDuration = audioDuration / MAX_AUDIO_SPEEDUP;
        videoSpeed = targetDuration / originalDuration;  // ← Có thể sai?
    }
}
```

**Câu hỏi**:
- `targetDuration` có đúng không?
- `videoSpeed` có đúng không?
- Có case nào `targetDuration` = 0 hoặc âm?

---

### Issue #2: actualDuration vs targetDuration Drift (BƯỚC 3)

**Vấn đề**:
```typescript
// Line 571-576
const actualDuration = await getMediaDuration(outSegWav);
segmentTimings[idx] = {
    expectedDuration: seg.targetDuration,
    actualDuration: actualDuration,
    drift: actualDuration - seg.targetDuration
};
```

**Câu hỏi**:
- Tại sao `actualDuration` khác `targetDuration`?
- FFmpeg `-t` option không chính xác?
- `atempo` filter không chính xác?
- Drift tích lũy có ảnh hưởng gì?

---

### Issue #3: Video Speed Adjustment (BƯỚC 5)

**Vấn đề**:
```typescript
// Line 739-741, 869-871
const adjustedSpeed = actualSegmentDuration / seg.targetDuration;
const clampedAdjustedSpeed = Math.max(0.5, Math.min(2.0, adjustedSpeed));
const totalVideoSpeed = seg.videoSpeed * clampedAdjustedSpeed;
```

**Câu hỏi**:
- `adjustedSpeed` có đúng không?
- Tại sao cần adjust dựa trên `actualSegmentDuration`?
- `totalVideoSpeed` có đúng không?
- `setpts=${1/totalVideoSpeed}*PTS` có đúng không?

---

### Issue #4: Trim Filter Precision (BƯỚC 5)

**Vấn đề**:
```typescript
// Line 728, 858
filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
```

**Câu hỏi**:
- `trim` có chính xác không với non-keyframe positions?
- Có mất frames không?
- `setpts=PTS-STARTPTS` có đủ không?

---

### Issue #5: Video Length vs Audio Length Mismatch (BƯỚC 5)

**Vấn đề**:
```typescript
// Video length = sum of (actualSegmentDuration * totalVideoSpeed)
// Audio length = sum of actualSegmentDuration
// Nếu khác nhau → sync issue
```

**Câu hỏi**:
- Video length có match audio length không?
- Nếu không match → FFmpeg xử lý thế nào?
- Có gây frozen frames không?

---

## 🎯 KẾ HOẠCH DEBUG

### Phase 1: Verify Segment Map (BƯỚC 1)

**Mục tiêu**: Kiểm tra `targetDuration` và `videoSpeed` calculation

**Actions**:
1. Add extensive logging trong `buildSegmentMap()`:
   ```typescript
   console.log(`[SegmentMap] Segment ${i}:`);
   console.log(`  videoStart: ${entryStart.toFixed(3)}s`);
   console.log(`  videoEnd: ${entryEnd.toFixed(3)}s`);
   console.log(`  videoDuration: ${(entryEnd - entryStart).toFixed(3)}s`);
   console.log(`  audioDuration: ${audioDuration.toFixed(3)}s`);
   console.log(`  ratio: ${(audioDuration / originalDuration).toFixed(4)}`);
   console.log(`  audioSpeed: ${audioSpeed.toFixed(4)}`);
   console.log(`  targetDuration: ${targetDuration.toFixed(3)}s`);
   console.log(`  videoSpeed: ${videoSpeed.toFixed(4)}`);
   ```

2. Verify logic:
   - Nếu `audioDuration > originalDuration * 1.4`:
     - `audioSpeed` = 1.4 ✓
     - `targetDuration` = `audioDuration / 1.4` ✓
     - `videoSpeed` = `targetDuration / originalDuration` ✓
   - Check có case nào `targetDuration` <= 0

3. Export segment map to JSON để analyze:
   ```typescript
   fs.writeFileSync('segment_map_debug.json', JSON.stringify(segments, null, 2));
   ```

---

### Phase 2: Track Audio Drift (BƯỚC 3)

**Mục tiêu**: Hiểu tại sao `actualDuration` ≠ `targetDuration`

**Actions**:
1. Add detailed logging trong `processAudioSegment()`:
   ```typescript
   console.log(`[Audio] Segment ${idx}:`);
   console.log(`  targetDuration: ${seg.targetDuration.toFixed(3)}s`);
   console.log(`  actualDuration: ${actualDuration.toFixed(3)}s`);
   console.log(`  drift: ${(actualDuration - seg.targetDuration).toFixed(3)}s`);
   console.log(`  audioSpeed: ${seg.audioSpeed.toFixed(4)}`);
   console.log(`  videoSpeed: ${seg.videoSpeed.toFixed(4)}`);
   ```

2. Track cumulative drift:
   ```typescript
   let cumulativeDrift = 0;
   for (let i = 0; i < segmentTimings.length; i++) {
       cumulativeDrift += segmentTimings[i].drift;
       if (Math.abs(cumulativeDrift) > 0.1) {
           console.warn(`[Drift] Cumulative drift at segment ${i}: ${cumulativeDrift.toFixed(3)}s`);
       }
   }
   ```

3. Analyze:
   - Drift pattern: Random hay systematic?
   - Drift direction: Positive (longer) hay negative (shorter)?
   - Drift magnitude: Có tích lũy không?

---

### Phase 3: Verify Video Filter Logic (BƯỚC 5)

**Mục tiêu**: Kiểm tra `adjustedSpeed` và `totalVideoSpeed` calculation

**Actions**:
1. Add logging trước khi build filter:
   ```typescript
   console.log(`[VideoFilter] Segment ${i}:`);
   console.log(`  seg.targetDuration: ${seg.targetDuration.toFixed(3)}s`);
   console.log(`  actualSegmentDuration: ${actualSegmentDuration.toFixed(3)}s`);
   console.log(`  adjustedSpeed: ${adjustedSpeed.toFixed(4)}`);
   console.log(`  clampedAdjustedSpeed: ${clampedAdjustedSpeed.toFixed(4)}`);
   console.log(`  seg.videoSpeed: ${seg.videoSpeed.toFixed(4)}`);
   console.log(`  totalVideoSpeed: ${totalVideoSpeed.toFixed(4)}`);
   console.log(`  ptsMultiplier: ${(1.0 / totalVideoSpeed).toFixed(4)}`);
   console.log(`  filter: ${filterStr}`);
   ```

2. Export filter script để manual review:
   ```typescript
   // Filter script đã được save: temp_final/video_filter_batch_*.txt
   // Review manually
   ```

3. Verify logic:
   - `adjustedSpeed` = `actualSegmentDuration / targetDuration` ✓
   - `totalVideoSpeed` = `seg.videoSpeed * clampedAdjustedSpeed` ✓
   - `ptsMultiplier` = `1.0 / totalVideoSpeed` ✓
   - Nếu `totalVideoSpeed > 1.0` → slow motion (video dài hơn)
   - Nếu `totalVideoSpeed < 1.0` → fast forward (video ngắn hơn)

---

### Phase 4: Measure Video vs Audio Length (BƯỚC 5)

**Mục tiêu**: Verify video length match audio length

**Actions**:
1. Calculate expected video length:
   ```typescript
   let expectedVideoLength = 0;
   for (let i = 0; i < segments.length; i++) {
       const actualAudioDur = actualDurations[i];
       const adjustedSpeed = actualAudioDur / segments[i].targetDuration;
       const clampedSpeed = Math.max(0.5, Math.min(2.0, adjustedSpeed));
       const totalSpeed = segments[i].videoSpeed * clampedSpeed;
       
       // Video duration after speed adjustment
       const videoDur = segments[i].videoDuration / totalSpeed;
       expectedVideoLength += videoDur;
   }
   console.log(`[VideoLength] Expected: ${expectedVideoLength.toFixed(3)}s`);
   ```

2. Measure actual video length:
   ```typescript
   const actualVideoLength = await getMediaDuration(outputPath);
   console.log(`[VideoLength] Actual: ${actualVideoLength.toFixed(3)}s`);
   ```

3. Compare:
   ```typescript
   const lengthDiff = actualVideoLength - totalActual; // totalActual = audio length
   console.log(`[VideoLength] Video vs Audio diff: ${lengthDiff.toFixed(3)}s`);
   
   if (Math.abs(lengthDiff) > 0.1) {
       console.error(`[VideoLength] MISMATCH! Video and audio lengths differ by ${lengthDiff.toFixed(3)}s`);
   }
   ```

---

### Phase 5: Manual Video Inspection

**Mục tiêu**: Xác định chính xác vị trí frozen frames

**Actions**:
1. Play output video
2. Note timestamps của frozen frames:
   - Ở đầu video?
   - Ở giữa (segment boundaries)?
   - Ở cuối video?
   - Random?

3. Check segment boundaries:
   - Frozen frames có xảy ra ở batch boundaries không?
   - Frozen frames có xảy ra ở segment boundaries không?

4. Check audio sync:
   - Audio có bị delay không?
   - Audio có bị cut không?
   - Audio có match video không?

---

## 📋 DEBUG CHECKLIST

### Trước khi debug:
- [ ] Backup code hiện tại
- [ ] Prepare test project (200conongdot hoặc nhỏ hơn)
- [ ] Clear temp_final directory

### Phase 1: Segment Map
- [ ] Add logging trong buildSegmentMap()
- [ ] Run và collect logs
- [ ] Export segment_map_debug.json
- [ ] Analyze: Có segment nào có targetDuration <= 0?
- [ ] Analyze: Có segment nào có videoSpeed quá lớn/nhỏ?

### Phase 2: Audio Drift
- [ ] Add logging trong processAudioSegment()
- [ ] Run và collect logs
- [ ] Calculate cumulative drift
- [ ] Analyze drift pattern

### Phase 3: Video Filter
- [ ] Add logging trước build filter
- [ ] Run và collect logs
- [ ] Review filter scripts manually
- [ ] Verify ptsMultiplier calculations

### Phase 4: Length Verification
- [ ] Calculate expected video length
- [ ] Measure actual video length
- [ ] Compare với audio length
- [ ] Identify mismatch

### Phase 5: Manual Inspection
- [ ] Play output video
- [ ] Note frozen frame timestamps
- [ ] Check segment boundaries
- [ ] Check audio sync

---

## 🎯 EXPECTED FINDINGS

Sau khi debug, chúng ta sẽ biết:

1. **Root cause của frozen frames**:
   - Segment map calculation sai?
   - Audio drift tích lũy?
   - Video speed adjustment sai?
   - Trim filter precision issue?
   - Video/audio length mismatch?

2. **Vị trí chính xác của vấn đề**:
   - Trong buildSegmentMap()?
   - Trong processAudioSegment()?
   - Trong video filter generation?
   - Trong FFmpeg encoding?

3. **Giải pháp cụ thể**:
   - Fix calculation logic
   - Adjust filter generation
   - Change FFmpeg parameters
   - Add compensation logic

---

**Next Step**: Implement Phase 1 logging và run test với project thực để collect data.
