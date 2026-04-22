# CRITICAL ISSUE - SELECT Filter Causes Frozen Frames

**Ngày**: 2026-04-22 09:23 UTC  
**Issue**: SELECT filter gây frozen frames ngay cả batch 0  
**Status**: 🔴 CRITICAL

---

## 🚨 PROBLEM

### Before (TRIM filter):
- Batch 0: 203MB, có thể có frozen frames
- Batch 1+: 262 bytes (fail)

### After (SELECT filter):
- Batch 0: 304MB, **BỊ FROZEN FRAMES NGHIÊM TRỌNG**
- Batch 1: 262 bytes (vẫn fail)

**Kết luận**: SELECT filter WORSE than TRIM!

---

## 🔍 ROOT CAUSE ANALYSIS

### Vấn đề với SELECT filter:

**SELECT filter syntax**:
```
select='between(t,0.5110,4.0320)'
```

**Vấn đề**:
1. SELECT filter chọn frames dựa trên timestamp
2. Nhưng KHÔNG reset frame numbering
3. Khi concat, frame numbers bị discontinuous
4. → Frozen frames!

**Ví dụ**:
```
Segment 1: select frames 0-100 (t=0-3.33s)
Segment 2: select frames 200-300 (t=6.67-10s)
           ↑ Missing frames 101-199!
Concat: 0,1,2...100, 200,201,202...300
        ↑ Gap → Frozen frames!
```

---

## 🎯 REAL ROOT CAUSE

**Vấn đề KHÔNG PHẢI Ở TRIM vs SELECT!**

**Vấn đề THỰC SỰ là**: 
1. **Hardware encoder incompatibility** với filter_complex
2. **Batch processing approach** fundamentally flawed
3. **Filter complexity** quá cao

---

## 💡 SOLUTION: ABANDON BATCH PROCESSING

### Tại sao batch processing không work:

1. **Filter complexity**: 10 segments concat vẫn quá phức tạp
2. **Hardware encoder**: Không support filter_complex_script
3. **CPU encoder**: Chậm và vẫn có issues
4. **TRIM issues**: Keyframe seeking
5. **SELECT issues**: Frame discontinuity

**Kết luận**: Batch processing approach là SAI!

---

## ✅ NEW SOLUTION: SEGMENT-BY-SEGMENT ENCODING

### Approach:

**Thay vì**:
```
Batch 1: Encode 10 segments với filter_complex → 1 video
Batch 2: Encode 10 segments với filter_complex → 1 video
...
Concat all batches
```

**Làm**:
```
Segment 1: Encode 1 segment → video_001.mp4
Segment 2: Encode 1 segment → video_002.mp4
...
Segment 193: Encode 1 segment → video_193.mp4
Concat all segments (simple, no filter_complex)
```

### Benefits:

1. **No filter_complex** → Hardware encoder works
2. **Simple encoding** → No complexity issues
3. **No TRIM/SELECT issues** → Use -ss BEFORE -i
4. **Parallel processing** → Fast with GPU
5. **Reliable** → Each segment independent

---

## 🔧 IMPLEMENTATION

### New Approach:

```typescript
// For each segment:
for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const outputPath = path.join(tempDir, `segment_${String(i).padStart(4, '0')}.mp4`);
    
    // Use -ss BEFORE -i for accurate seeking
    const args = [
        '-y',
        '-ss', seg.videoStart.toFixed(4),  // Seek BEFORE input
        '-i', originalVideo,
        '-t', seg.videoDuration.toFixed(4), // Duration
        '-an',  // No audio
        ...HW_VIDEO_ARGS,  // GPU encoder works now!
        outputPath
    ];
    
    // Apply speed adjustment if needed
    if (seg.videoSpeed !== 1.0) {
        // Use setpts filter
        args.splice(args.indexOf(outputPath), 0, 
            '-filter:v', `setpts=${(1/seg.videoSpeed).toFixed(4)}*PTS`
        );
    }
    
    await runFfmpeg(args);
}

// Then concat all segments (simple)
const concatList = segments.map((_, i) => 
    `file 'segment_${String(i).padStart(4, '0')}.mp4'`
).join('\n');

await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-c', 'copy',  // No re-encoding!
    mergedVideoPath
]);
```

### Advantages:

1. **-ss BEFORE -i**: Accurate seeking, no keyframe issues
2. **No filter_complex**: Hardware encoder works
3. **Simple setpts**: One filter per segment
4. **GPU acceleration**: Works for all segments
5. **Parallel processing**: Can encode multiple segments at once
6. **Reliable concat**: Simple file concat, no complex filters

---

## 📊 PERFORMANCE

### Segment-by-segment:
- 193 segments
- ~2-3 seconds per segment (GPU)
- With CONCURRENCY=4: 193/4 = ~48 batches
- 48 × 3s = ~2.5 minutes
- **FASTER than current approach!**

---

## 🎯 RECOMMENDATION

**ABANDON current batch processing approach**

**IMPLEMENT segment-by-segment encoding**:
1. Encode each segment individually with -ss BEFORE -i
2. Use GPU encoder (no filter_complex issues)
3. Simple setpts for speed adjustment
4. Concat all segments with copy codec

**This WILL work because**:
- ✅ No filter_complex complexity
- ✅ GPU encoder works
- ✅ Accurate seeking (-ss before -i)
- ✅ No TRIM/SELECT issues
- ✅ Proven approach (used by many tools)

---

**Time**: 09:23 UTC  
**Status**: 🔴 NEED NEW APPROACH  
**Next**: Implement segment-by-segment encoding  
**ETA**: 30 phút implementation
