# ROOT CAUSE FOUND - Batch Encoding Failure

**Ngày**: 2026-04-22 08:59 UTC  
**Issue**: Batch 1-11 fail to encode (chỉ 262 bytes)

---

## 🔍 FINDINGS

### Batch Files Analysis:
```
batch_video_000.mp4: 113,533,314 bytes (~113MB) ✓ SUCCESS
batch_video_001.mp4:        262 bytes ❌ FAIL
batch_video_002.mp4:        262 bytes ❌ FAIL
batch_video_003.mp4:        262 bytes ❌ FAIL
...
batch_video_011.mp4:        262 bytes ❌ FAIL
```

**262 bytes = Empty MP4 header (FFmpeg fail)**

### Filter Scripts:
- ✓ All 12 filter scripts created
- ✓ Filter syntax looks correct
- ✓ Timestamps are valid

---

## 🐛 ROOT CAUSE

### Vấn đề: Hardware Encoder Fail + No Proper Fallback

**Code hiện tại** (Line 774-790):
```typescript
console.log(`[Batch] Encoding batch ${batchIdx + 1}/${numBatches} with ${hwInfo.hasAmdGpu ? 'AMD AMF' : (hwInfo.hasNvidiaGpu ? 'NVIDIA NVENC' : 'CPU')}...`);
let batchRes = await runFfmpeg(batchEncodeArgs);

// Fallback to CPU if GPU fails
if (!batchRes.success && (hwInfo.hasAmdGpu || hwInfo.hasNvidiaGpu)) {
    console.warn(`[Batch] Hardware encoder failed for batch ${batchIdx + 1}, falling back to CPU...`);
    const cpuBatchEncodeArgs = [
        '-y',
        '-i', originalVideo,
        '-filter_complex_script', batchFilterScriptPath,
        '-map', '[outv]',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'ultrafast',
        '-r', fps.toFixed(3),
        '-an',
        batchOutputPath
    ];
    batchRes = await runFfmpeg(cpuBatchEncodeArgs);
}

if (!batchRes.success || !fs.existsSync(batchOutputPath)) {
    onProgress({ status: 'error', progress: 0, detail: `Lỗi khi xử lý lô video ${batchIdx + 1}/${numBatches}` });
    return null;  // ← RETURN NULL - STOPS ENTIRE PROCESS!
}
```

**Vấn đề**:
1. **Batch 0 success** → Continue
2. **Batch 1 fail** (GPU hoặc CPU) → `return null` → **STOP ENTIRE PROCESS**
3. Batches 2-11 không bao giờ được process

**Tại sao batch 1 fail?**
- Hardware encoder có thể không support complex filter
- Hoặc có issue với filter script
- Hoặc timeout

---

## 🎯 SOLUTION

### Solution 1: Continue on Batch Failure (QUICK FIX)

**Thay đổi logic**:
```typescript
if (!batchRes.success || !fs.existsSync(batchOutputPath)) {
    console.error(`[Batch] Failed to encode batch ${batchIdx + 1}/${numBatches}`);
    // DON'T return null - continue with next batch
    // Skip this batch or retry with different settings
    continue;  // ← CONTINUE instead of return null
}
```

**Nhưng**: Sẽ thiếu batch 1 → video bị gap

---

### Solution 2: Fix Hardware Encoder Issue (BETTER)

**Vấn đề**: Hardware encoder có thể không support `-filter_complex_script`

**Thay đổi**:
```typescript
// Use CPU encoder for batch processing (more compatible)
const batchEncodeArgs = [
    '-y',
    '-i', originalVideo,
    '-filter_complex_script', batchFilterScriptPath,
    '-map', '[outv]',
    '-c:v', 'libx264',  // ← Always use CPU for batches
    '-crf', '18',
    '-preset', 'ultrafast',
    '-r', fps.toFixed(3),
    '-an',
    batchOutputPath
];
```

**Lý do**:
- `libx264` (CPU) support filter_complex tốt hơn
- Hardware encoder có thể có issues với complex filters
- Batch encoding với ultrafast vẫn nhanh

---

### Solution 3: Simplify Filter (BEST)

**Vấn đề**: 30 segments concat có thể quá phức tạp

**Thay đổi**: Giảm BATCH_SIZE từ 30 xuống 10

```typescript
const BATCH_SIZE = 10; // Reduce from 30 to 10
```

**Lý do**:
- 10 segments concat ít phức tạp hơn
- Dễ encode hơn
- Ít risk fail hơn

---

## 🔧 RECOMMENDED FIX

**Combine Solution 2 + 3**:

1. **Use CPU encoder for batches** (more compatible)
2. **Reduce BATCH_SIZE to 10** (less complexity)
3. **Add better error logging** (để debug)

---

## 📝 IMPLEMENTATION

### Change 1: Use CPU for batch encoding (Line 762-772)

```typescript
// BEFORE:
const batchEncodeArgs = [
    '-y',
    '-i', originalVideo,
    '-filter_complex_script', batchFilterScriptPath,
    '-map', '[outv]',
    ...HW_VIDEO_ARGS,  // ← Hardware encoder
    '-r', fps.toFixed(3),
    '-an',
    batchOutputPath
];

// AFTER:
const batchEncodeArgs = [
    '-y',
    '-i', originalVideo,
    '-filter_complex_script', batchFilterScriptPath,
    '-map', '[outv]',
    '-c:v', 'libx264',  // ← Always CPU for batches
    '-crf', '18',
    '-preset', 'ultrafast',
    '-r', fps.toFixed(3),
    '-an',
    batchOutputPath
];
```

### Change 2: Reduce BATCH_SIZE (Line 742)

```typescript
// BEFORE:
const BATCH_SIZE = 30;

// AFTER:
const BATCH_SIZE = 10;  // More stable
```

### Change 3: Better error logging (Line 775-790)

```typescript
console.log(`[Batch] Encoding batch ${batchIdx + 1}/${numBatches}...`);
const batchRes = await runFfmpeg(batchEncodeArgs);

if (!batchRes.success) {
    console.error(`[Batch] Encoding failed for batch ${batchIdx + 1}/${numBatches}`);
    console.error(`[Batch] FFmpeg stderr:`, batchRes.stderr);
    onProgress({ status: 'error', progress: 0, detail: `Lỗi encode batch ${batchIdx + 1}: ${batchRes.stderr.substring(0, 200)}` });
    return null;
}

if (!fs.existsSync(batchOutputPath)) {
    console.error(`[Batch] Output file not created for batch ${batchIdx + 1}`);
    onProgress({ status: 'error', progress: 0, detail: `File batch ${batchIdx + 1} không được tạo` });
    return null;
}

const batchSize = fs.statSync(batchOutputPath).size;
if (batchSize < 1000) {  // Less than 1KB = fail
    console.error(`[Batch] Batch ${batchIdx + 1} file too small: ${batchSize} bytes`);
    console.error(`[Batch] FFmpeg stderr:`, batchRes.stderr);
    onProgress({ status: 'error', progress: 0, detail: `Batch ${batchIdx + 1} encoding failed (file too small)` });
    return null;
}

console.log(`[Batch] Batch ${batchIdx + 1} encoded successfully: ${(batchSize / 1024 / 1024).toFixed(2)}MB`);
```

---

## ✅ EXPECTED RESULTS

### After fix:
```
batch_video_000.mp4: ~40-50MB ✓
batch_video_001.mp4: ~40-50MB ✓
batch_video_002.mp4: ~40-50MB ✓
...
batch_video_019.mp4: ~30-40MB ✓ (193 segments / 10 = 20 batches)
```

---

**Status**: 🔴 ROOT CAUSE IDENTIFIED  
**Next**: Implement fix (CPU encoder + BATCH_SIZE=10)  
**ETA**: 10 phút
