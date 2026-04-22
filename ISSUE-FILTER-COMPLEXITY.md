# VẤN ĐỀ PHÁT HIỆN - FFmpeg Filter Graph quá phức tạp

**Thời gian**: 2026-04-21 21:49 (UTC+7)

## 🔴 VẤN ĐỀ NGHIÊM TRỌNG

### Hiện tượng:
- Render chỉ chạy được vài segments đầu
- Các segments sau bị skip rất nhanh
- Video output bị lỗi

### Nguyên nhân:
**FFmpeg concat filter với 349 inputs quá phức tạp!**

```
[v0][v1][v2]...[v348]concat=n=349:v=1:a=0,format=yuv420p[outv]
```

### Tại sao nguy hiểm:
1. FFmpeg có giới hạn filter graph complexity
2. 349 nodes × (trim + setpts + fps) = ~1047 filter operations
3. FFmpeg phải load tất cả 349 segments vào memory cùng lúc
4. Concat 349 inputs trong 1 lần → memory spike
5. Có thể gây:
   - FFmpeg crash
   - Out of memory
   - Render rất chậm
   - Video output corrupt

### Bằng chứng:
- Audio segments: 349 files ✅ (đã tạo đầy đủ)
- Video filter: 349 inputs trong 1 concat ❌ (quá phức tạp)
- Kết quả: Render fail sau vài segments

---

## ✅ GIẢI PHÁP

### Approach 1: Batch Rendering (Recommended)

**Chia 349 segments thành batches nhỏ, render từng batch, sau đó concat các batch lại**

```typescript
const BATCH_SIZE = 50; // Concat tối đa 50 segments mỗi lần
const numBatches = Math.ceil(segments.length / BATCH_SIZE);

// Step 1: Render each batch
for (let batchIdx = 0; batchIdx < numBatches; batchIdx++) {
    const start = batchIdx * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, segments.length);
    const batchSegments = segments.slice(start, end);
    
    // Render batch to batch_0.mp4, batch_1.mp4, etc.
    await renderBatch(batchSegments, `batch_${batchIdx}.mp4`);
}

// Step 2: Concat all batches
await concatBatches(['batch_0.mp4', 'batch_1.mp4', ...], 'final_video.mp4');
```

**Ưu điểm:**
- Mỗi batch chỉ có 50 segments → FFmpeg xử lý dễ dàng
- Memory usage thấp hơn nhiều
- Nếu 1 batch fail → chỉ cần retry batch đó
- Có thể parallel render các batches

**Nhược điểm:**
- Phức tạp hơn
- Cần 2 passes (render batches + concat batches)

---

### Approach 2: Concat demuxer (Simpler)

**Dùng FFmpeg concat demuxer thay vì filter**

```typescript
// Thay vì dùng filter_complex với 349 inputs
// Dùng concat demuxer:

// Step 1: Render từng segment thành video file
for (let i = 0; i < segments.length; i++) {
    await renderSegment(segments[i], `seg_${i}.mp4`);
}

// Step 2: Concat với demuxer
const concatList = segments.map((_, i) => `file 'seg_${i}.mp4'`).join('\n');
fs.writeFileSync('concat_video.txt', concatList);

await runFfmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat_video.txt',
    '-c', 'copy', // Copy codec, không re-encode
    'final_video.mp4'
]);
```

**Ưu điểm:**
- Đơn giản hơn
- FFmpeg concat demuxer rất nhanh (chỉ copy, không re-encode)
- Không có giới hạn số lượng files

**Nhược điểm:**
- Phải render 349 video files riêng lẻ (tốn disk)
- Mỗi segment phải encode riêng (chậm hơn)

---

### Approach 3: Reduce segments (Quick fix)

**Merge các segments nhỏ lại với nhau**

```typescript
// Merge các gap segments ngắn (<0.5s) với segment trước/sau
const mergedSegments = mergeSmallSegments(segments, 0.5);
// 349 segments → ~200 segments
```

**Ưu điểm:**
- Đơn giản nhất
- Giảm số segments → giảm complexity

**Nhược điểm:**
- Mất độ chính xác timing
- Vẫn có thể quá nhiều segments

---

## 🎯 KHUYẾN NGHỊ

**Implement Approach 1 (Batch Rendering)**

### Implementation Plan:

1. **Chia segments thành batches**
   ```typescript
   const BATCH_SIZE = 50;
   const batches = [];
   for (let i = 0; i < segments.length; i += BATCH_SIZE) {
       batches.push(segments.slice(i, i + BATCH_SIZE));
   }
   ```

2. **Render từng batch**
   ```typescript
   for (let i = 0; i < batches.length; i++) {
       const batchOutput = path.join(tempDir, `batch_${i}.mp4`);
       await renderVideoBatch(batches[i], batchOutput, i * BATCH_SIZE);
   }
   ```

3. **Concat các batches**
   ```typescript
   const batchList = batches.map((_, i) => `file 'batch_${i}.mp4'`).join('\n');
   fs.writeFileSync('concat_batches.txt', batchList);
   
   await runFfmpeg([
       '-f', 'concat',
       '-safe', '0',
       '-i', 'concat_batches.txt',
       '-i', finalAudioWav,
       '-c:v', 'copy', // Copy video, không re-encode
       '-c:a', 'aac',
       '-map', '0:v',
       '-map', '1:a',
       outputPath
   ]);
   ```

### Ước tính:
- 349 segments ÷ 50 = 7 batches
- Mỗi batch: ~2 phút render
- Total: ~14 phút + 1 phút concat = **15 phút**

---

## 📝 TODO

- [ ] Implement batch rendering logic
- [ ] Test với BATCH_SIZE = 50
- [ ] Verify video output không bị seam giữa các batches
- [ ] Add progress tracking cho từng batch
- [ ] Cleanup batch files sau khi concat

---

## 🚨 HÀNH ĐỘNG NGAY

**Tạm thời workaround:**

Giảm số segments bằng cách merge các gap nhỏ:

```typescript
// Trong buildSegmentMap, skip gaps < 0.5s
if (entryStart > prevEnd + 0.5) { // Thay vì 0.05
    segments.push({ type: 'gap', ... });
}
```

Điều này sẽ giảm từ 349 → ~200 segments, có thể đủ để FFmpeg xử lý.

**Long-term fix:**

Implement batch rendering như trên.

---

**Kết luận**: Vấn đề KHÔNG phải ở logic adjustedSpeed, mà là **FFmpeg filter graph quá phức tạp với 349 segments**!
