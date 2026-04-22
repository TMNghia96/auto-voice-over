# CRITICAL BUG FOUND - Video Duration Mismatch

**Ngày**: 2026-04-21 17:02 UTC  
**Severity**: CRITICAL  
**Status**: 🔴 BLOCKING ISSUE

---

## 🚨 PROBLEM DISCOVERED

### Test Results từ 200conongdot:
- **Original video**: 729.36s (~12.2 phút) ✓
- **Audio segments**: 349 segments ✓
- **Final audio**: 802.55s (~13.4 phút) ✓
- **Merged video**: 19.3s (579 frames @ 30fps) ❌
- **Final video**: 19.3s ❌

**CRITICAL**: Video chỉ có 19.3 giây trong khi audio có 802 giây!

---

## 🔍 ROOT CAUSE ANALYSIS

### Vấn đề: Batch Processing tạo video quá ngắn

**Batch concat list có 12 batches**:
```
batch_video_000.mp4
batch_video_001.mp4
...
batch_video_011.mp4
```

**Nhưng merged_video.mp4 chỉ có 19.3s!**

### Possible Causes:

#### HYPOTHESIS #1: Batch videos không được tạo đúng
- Batch encoding có thể fail
- Chỉ batch đầu tiên được tạo
- Các batch khác bị skip hoặc empty

#### HYPOTHESIS #2: Concat demuxer fail
```typescript
// Line 795-799
const mergeRes = await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', batchListPath,
    '-c:v', 'copy',
    mergedVideoPath
]);
```
- Concat có thể chỉ lấy batch đầu tiên
- Hoặc fail silent

#### HYPOTHESIS #3: Batch filter scripts sai
- Filter script có thể tạo video rất ngắn
- Trim/setpts logic sai
- Segments không được process đúng

---

## 🔧 DEBUGGING STEPS

### Step 1: Check batch video files (đã bị cleanup)

Batch files đã bị cleanup nên không thể kiểm tra:
```
batch_video_000.mp4 - DELETED
batch_video_001.mp4 - DELETED
...
```

**Problem**: Không thể verify duration của từng batch

### Step 2: Check batch_concat_list.txt

```
file 'C:/Users/.../batch_video_000.mp4'
file 'C:/Users/.../batch_video_001.mp4'
...
file 'C:/Users/.../batch_video_011.mp4'
```

12 batches listed ✓

### Step 3: Analyze the issue

**19.3 seconds = ~579 frames @ 30fps**

Nếu mỗi batch có ~30 segments:
- 30 segments × ~2-3s/segment = ~60-90s/batch
- 12 batches × 60s = ~720s expected
- **Actual: 19.3s** ❌

**Conclusion**: Chỉ có 1 batch được process, hoặc concat fail

---

## 🎯 ROOT CAUSE: BATCH ENCODING LOGIC SAI

### Vấn đề trong code:

```typescript
// Line 763-794: Batch processing loop
batchSegments.forEach((seg, localIdx) => {
    const globalIdx = batchStart + localIdx;
    const vLabel = `v${localIdx}`;
    const start = seg.videoStart.toFixed(4);
    const end = seg.videoEnd.toFixed(4);
    
    let filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
    
    // ... build filter
    
    batchFilterChunks.push(filterStr);
    batchConcatInputs.push(`[${vLabel}]`);
});

batchFilterChunks.push(`${batchConcatInputs.join('')}concat=n=${batchSegments.length}:v=1:a=0,format=yuv420p[outv]`);
```

**PROBLEM**: 
- `seg.videoStart` và `seg.videoEnd` là **absolute timestamps** trong original video
- Nhưng mỗi batch đều dùng **CÙNG original video** làm input
- Batch 2 sẽ trim từ giây 60-120 của original video
- Batch 3 sẽ trim từ giây 120-180 của original video
- **Tất cả đều OK!**

**VẬY TẠI SAO CHỈ CÓ 19.3s?**

---

## 🐛 ACTUAL ROOT CAUSE

### Kiểm tra lại logic:

**Batch 1** (segments 0-29):
- Segment 0: trim=0.511:4.032 ✓
- Segment 1: trim=4.672:6.113 ✓
- ...
- Segment 29: trim=X:Y ✓
- **Expected output**: ~60-90s

**Batch 2** (segments 30-59):
- Segment 30: trim=A:B ✓
- ...

**Nhưng merged_video chỉ có 19.3s!**

### Possible Issues:

#### Issue #1: Batch encoding fail silent
```typescript
const batchRes = await runFfmpeg(batchEncodeArgs);

if (!batchRes.success || !fs.existsSync(batchOutputPath)) {
    onProgress({ status: 'error', progress: 0, detail: `Lỗi khi xử lý lô video ${batchIdx + 1}/${numBatches}` });
    return null;  // ← RETURN NULL, không continue!
}
```

**Nếu batch 1 fail** → return null → không có error message?

#### Issue #2: Hardware encoder fail
```typescript
// Line 774-790: Hardware encoder với fallback
let batchRes = await runFfmpeg(batchEncodeArgs);

// Fallback to CPU if GPU fails
if (!batchRes.success && (hwInfo.hasAmdGpu || hwInfo.hasNvidiaGpu)) {
    console.warn(`[Batch] Hardware encoder failed for batch ${batchIdx + 1}, falling back to CPU...`);
    const cpuBatchEncodeArgs = [...];
    batchRes = await runFfmpeg(cpuBatchEncodeArgs);
}
```

**Nếu cả GPU và CPU đều fail** → batch video không được tạo

#### Issue #3: Filter script quá phức tạp
- 30 segments × complex filter = quá phức tạp
- FFmpeg timeout hoặc fail
- Chỉ process được vài segments đầu

---

## 🎯 SOLUTION

### Solution: DISABLE BATCH CLEANUP để debug

**Thay đổi**:
```typescript
// Line 950-962: Comment out cleanup
// if (needsBatching) {
//     console.log('[Cleanup] Removing batch video files...');
//     const batchFiles = fs.readdirSync(tempDir).filter(f => 
//         f.startsWith('batch_video_') || f.startsWith('video_filter_batch_')
//     );
//     for (const file of batchFiles) {
//         try {
//             fs.unlinkSync(path.join(tempDir, file));
//         } catch (e) {
//             console.warn(`[Cleanup] Failed to remove ${file}:`, e);
//         }
//     }
// }
```

**Sau đó test lại** để kiểm tra:
1. Duration của từng batch_video_XXX.mp4
2. Filter scripts (video_filter_batch_XXX.txt)
3. Console logs để xem batch nào fail

---

## 🚨 IMMEDIATE ACTION REQUIRED

1. **Comment out batch cleanup code**
2. **Test lại với 200conongdot**
3. **Check batch video files**:
   - Duration của mỗi batch
   - Có bao nhiêu batches được tạo thành công
   - Filter scripts có đúng không

4. **Analyze logs** để tìm batch nào fail

---

**Status**: 🔴 CRITICAL BUG - Video duration mismatch  
**Next**: Disable cleanup và test lại để debug
