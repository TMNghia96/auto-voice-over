# Testing Guide - FinalVideoService Bug Fixes

**Ngày**: 2026-04-21  
**Version**: Post-bugfix  
**Bugs fixed**: 3 critical bugs

---

## 🎯 MỤC TIÊU TESTING

Verify 3 bug fixes hoạt động đúng:
1. ✅ Batch processing (30 segments/batch)
2. ✅ GPU encoding (AMD/NVIDIA)
3. ✅ No frozen frames (PTS reset)

---

## 📋 TEST CASES

### Test Case 1: Small Project (<30 segments)

**Mục đích**: Verify single-pass path vẫn hoạt động

**Steps**:
1. Chọn project có <30 segments
2. Run final video render
3. Check console log

**Expected**:
```
[Video] Recalculating each segment based on actual audio duration...
[Encoder] Trying AMD AMF... (hoặc NVIDIA NVENC)
[Encoder] Successfully encoded with hardware acceleration
```

**Verify**:
- [ ] Không thấy `[Batch]` log (vì <30 segments)
- [ ] GPU encoding được sử dụng
- [ ] Video render thành công
- [ ] Video mượt, không frozen frames
- [ ] Audio sync

---

### Test Case 2: Medium Project (30-100 segments)

**Mục đích**: Verify batch processing với 2-4 batches

**Steps**:
1. Chọn project có 50-100 segments
2. Run final video render
3. Check console log

**Expected**:
```
[Batch] Processing 50 segments in batches of 30
[Batch] Processing batch 1/2 (segments 0-29)
[Batch] Encoding batch 1/2 with AMD AMF...
[Batch] Processing batch 2/2 (segments 30-49)
[Batch] Encoding batch 2/2 with AMD AMF...
[Batch] Merging 2 batch videos...
[Batch] Adding audio to merged video...
```

**Verify**:
- [ ] Thấy `[Batch]` log
- [ ] GPU encoding cho mỗi batch
- [ ] Progress: 60% → 85% (batch processing) → 90% (audio mux)
- [ ] Video render thành công
- [ ] Video mượt, không frozen frames
- [ ] Audio sync

---

### Test Case 3: Large Project (349 segments - 200conongdot)

**Mục đích**: Verify batch processing với 12 batches

**Steps**:
1. Open project `200conongdot`
2. Run final video render
3. Monitor console log và GPU usage

**Expected**:
```
[Batch] Processing 349 segments in batches of 30
[Batch] Processing batch 1/12 (segments 0-29)
[Batch] Encoding batch 1/12 with AMD AMF...
[Batch] Processing batch 2/12 (segments 30-59)
...
[Batch] Processing batch 12/12 (segments 330-348)
[Batch] Encoding batch 12/12 with AMD AMF...
[Batch] Merging 12 batch videos...
[Batch] Adding audio to merged video...
```

**Verify**:
- [ ] 12 batches được tạo
- [ ] GPU encoding cho tất cả batches
- [ ] GPU usage cao (60-90%) trong quá trình render
- [ ] Không crash, không out of memory
- [ ] Video render thành công
- [ ] **QUAN TRỌNG**: Video mượt, KHÔNG frozen frames
- [ ] Audio sync hoàn hảo
- [ ] File size hợp lý (~1-2GB cho 14 phút)

---

### Test Case 4: GPU Fallback

**Mục đích**: Verify fallback về CPU nếu GPU fail

**Steps**:
1. Tạm thời disable GPU (hoặc dùng máy không có GPU)
2. Run final video render
3. Check console log

**Expected**:
```
[Batch] Encoding batch 1/12 with CPU...
(hoặc)
[Batch] Hardware encoder failed for batch 1, falling back to CPU...
[Batch] Encoding batch 1/12 with CPU...
```

**Verify**:
- [ ] Fallback về CPU thành công
- [ ] Video render thành công (chậm hơn)
- [ ] Không crash

---

## 🔍 DEBUGGING CHECKLIST

Nếu gặp vấn đề, check các điểm sau:

### Frozen Frames Issue
- [ ] Check console log: Có thấy `setpts=PTS-STARTPTS` sau `trim`?
- [ ] Play video: Frozen frames ở đâu? (đầu segment, giữa, cuối?)
- [ ] Check filter script: `temp_final/video_filter_batch_*.txt`

### GPU Not Used
- [ ] Check console log: Có thấy "AMD AMF" hoặc "NVIDIA NVENC"?
- [ ] Check GPU usage: Task Manager → Performance → GPU
- [ ] Nếu thấy "CPU" → Check HardwareService detection

### Batch Processing Not Working
- [ ] Check số segments: Có >30 không?
- [ ] Check console log: Có thấy `[Batch]` không?
- [ ] Check temp files: `temp_final/batch_video_*.mp4` có được tạo không?

### Memory Issues
- [ ] Check free RAM: Cần ít nhất 2GB
- [ ] Check console log: Có warning về memory không?
- [ ] Reduce BATCH_SIZE nếu cần (từ 30 xuống 20)

---

## 📊 PERFORMANCE METRICS

### Expected Performance (349 segments, 14 phút video):

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Stability** | Crash | ✓ Stable | 100% |
| **Encoding Speed** | N/A (crash) | ~5-10 min | N/A |
| **GPU Usage** | 0% (CPU only) | 60-90% | ∞ |
| **Frozen Frames** | Many | 0 | 100% |
| **Memory Usage** | Spike → crash | Stable ~2GB | Stable |

### Timing Breakdown (349 segments):
- Audio processing: ~2-3 min (CONCURRENCY=2-4)
- Batch video encoding: ~3-5 min (12 batches × 15-25s/batch)
- Batch merging: ~30s
- Audio muxing: ~10s
- **Total**: ~5-10 min (depends on GPU)

---

## ✅ ACCEPTANCE CRITERIA

Project 200conongdot (349 segments) phải pass tất cả:

1. **Stability**
   - [ ] Không crash
   - [ ] Không out of memory
   - [ ] Render hoàn thành 100%

2. **Performance**
   - [ ] GPU encoding được sử dụng
   - [ ] Render trong <15 phút
   - [ ] GPU usage 60-90%

3. **Quality**
   - [ ] Video mượt mà, không frozen frames
   - [ ] Audio sync hoàn hảo
   - [ ] Không có glitches ở boundaries giữa các batches
   - [ ] Video quality tốt (không bị artifacts)

4. **Logging**
   - [ ] Console log rõ ràng
   - [ ] Progress tracking chính xác
   - [ ] Hiển thị encoder đang dùng

---

## 🚀 NEXT STEPS

Sau khi pass tất cả test cases:

1. [ ] Commit changes với message:
   ```
   fix: resolve FFmpeg complexity, GPU encoding, and frozen frames issues
   
   - Implement batch processing (30 segments/batch) for large projects
   - Use hardware GPU encoding (AMD/NVIDIA) instead of CPU
   - Fix frozen frames by resetting PTS after trim filter
   - Add automatic fallback to CPU if GPU fails
   
   Fixes #3 (FFmpeg complexity), GPU encoding, and frozen frames
   ```

2. [ ] Update CHANGELOG.md

3. [ ] Tag version: `v1.1.0-bugfix`

4. [ ] Deploy to production

---

## 📞 SUPPORT

Nếu gặp vấn đề:
1. Check console log
2. Check `BUGFIX-SUMMARY.md`
3. Check `ANALYSIS-VIDEO-RENDER-ISSUES.md`
4. Report issue với log đầy đủ
