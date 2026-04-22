# PHÂN TÍCH VẤN ĐỀ: FROZEN FRAMES TRONG VIDEO OUTPUT

**Ngày:** 2026-04-21  
**Vấn đề:** Video output có âm thanh OK nhưng hình ảnh bị đứng khung hình (frozen frames)

---

## 🔍 NGUYÊN NHÂN GỐC RỄ

### **Vấn đề 1: Logic setpts SAI với videoSpeed > 1.0**

**Code hiện tại (line 598):**
```typescript
filterChunks.push(`[0:v]trim=start=${start}:end=${end},setpts=${speed}*(PTS-STARTPTS),fps=${fps.toFixed(3)}[${vLabel}]`);
```

**Phân tích:**
```javascript
// Khi audioSpeed > 1.0 (audio dài hơn video):
audioSpeed = 1.3
targetDuration = audioDuration / 1.3
videoSpeed = targetDuration / originalDuration

// Ví dụ cụ thể:
originalDuration = 10s
audioDuration = 15s
ratio = 15/10 = 1.5 > 1.3

// Tính toán:
audioSpeed = 1.3
targetDuration = 15 / 1.3 = 11.54s
videoSpeed = 11.54 / 10 = 1.154

// FFmpeg filter:
setpts=1.154*(PTS-STARTPTS)

// ❌ SAI! setpts > 1.0 làm VIDEO CHẬM LẠI
// Nhưng mục đích là làm video DÀI RA để match với audio
// setpts=1.154 nghĩa là: mỗi frame hiển thị lâu hơn 1.154 lần
// → Video chậm lại → Frozen frames!
```

**Giải thích setpts:**
- `setpts=0.5*(PTS-STARTPTS)` → Video nhanh gấp 2x (mỗi frame hiển thị 0.5x thời gian)
- `setpts=1.0*(PTS-STARTPTS)` → Video tốc độ bình thường
- `setpts=2.0*(PTS-STARTPTS)` → Video chậm 2x (mỗi frame hiển thị 2x thời gian)

**Vấn đề:**
- Khi `videoSpeed = 1.154`, code dùng `setpts=1.154*(PTS-STARTPTS)`
- Điều này làm video CHẬM LẠI 1.154x
- Nhưng mục đích là làm video DÀI RA (stretch) để match audio
- Cần dùng `setpts=(PTS-STARTPTS)/1.154` để video chạy CHẬM HƠN (slow motion)

---

### **Vấn đề 2: Không có setpts khi videoSpeed = 1.0**

**Code hiện tại:**
```typescript
// Luôn dùng: setpts=${speed}*(PTS-STARTPTS)
// Kể cả khi speed = 1.0
```

**Vấn đề:**
- Khi `videoSpeed = 1.0`, vẫn apply `setpts=1.0*(PTS-STARTPTS)`
- Điều này reset PTS về 0 cho mỗi segment
- Có thể gây discontinuity khi concat

---

### **Vấn đề 3: fps filter có thể gây duplicate frames**

**Code hiện tại:**
```typescript
filterChunks.push(`[0:v]trim=start=${start}:end=${end},setpts=${speed}*(PTS-STARTPTS),fps=${fps.toFixed(3)}[${vLabel}]`);
```

**Vấn đề:**
- Apply `fps` filter sau `setpts` có thể gây duplicate frames
- Nếu video đã bị slow down bởi setpts, fps filter sẽ duplicate frames để maintain framerate
- → Frozen frames!

---

## 🎯 GIẢI PHÁP ĐỀ XUẤT

### **Solution 1: Fix setpts logic (RECOMMENDED)**

```typescript
segments.forEach((seg, i) => {
    const vLabel = `v${i}`;
    const start = seg.videoStart.toFixed(4);
    const end = seg.videoEnd.toFixed(4);
    const speed = seg.videoSpeed;
    
    let filterStr = `[0:v]trim=start=${start}:end=${end}`;
    
    if (Math.abs(speed - 1.0) > 0.001) {
        // videoSpeed > 1.0: Cần làm video CHẬM LẠI (slow motion)
        // videoSpeed < 1.0: Cần làm video NHANH LÊN (speed up)
        // setpts formula: setpts=PTS/(speed) để đạt được slow/fast motion
        const ptsMultiplier = (1.0 / speed).toFixed(4);
        filterStr += `,setpts=${ptsMultiplier}*PTS`;
    } else {
        // videoSpeed = 1.0: Không cần setpts, chỉ reset PTS
        filterStr += `,setpts=PTS-STARTPTS`;
    }
    
    // Apply fps để đồng nhất framerate
    filterStr += `,fps=${fps.toFixed(3)}[${vLabel}]`;
    
    filterChunks.push(filterStr);
    concatInputs.push(`[${vLabel}]`);
});
```

**Giải thích:**
```javascript
// Case 1: videoSpeed = 1.154 (cần làm video dài ra)
ptsMultiplier = 1.0 / 1.154 = 0.867
setpts = 0.867 * PTS
→ Video chạy CHẬM HƠN (slow motion)
→ 10s video gốc → 11.54s output ✅

// Case 2: videoSpeed = 0.8 (cần làm video ngắn lại)
ptsMultiplier = 1.0 / 0.8 = 1.25
setpts = 1.25 * PTS
→ Video chạy NHANH HƠN (speed up)
→ 10s video gốc → 8s output ✅

// Case 3: videoSpeed = 1.0 (không thay đổi)
setpts = PTS-STARTPTS
→ Chỉ reset timestamps, không thay đổi tốc độ ✅
```

---

### **Solution 2: Sử dụng atempo cho video (Alternative)**

```typescript
segments.forEach((seg, i) => {
    const vLabel = `v${i}`;
    const start = seg.videoStart.toFixed(4);
    const end = seg.videoEnd.toFixed(4);
    const speed = seg.videoSpeed;
    
    let filterStr = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
    
    if (Math.abs(speed - 1.0) > 0.001) {
        // Sử dụng setpts với công thức đúng
        const targetSpeed = (1.0 / speed).toFixed(4);
        filterStr = `[0:v]trim=start=${start}:end=${end},setpts=${targetSpeed}*(PTS-STARTPTS)`;
    }
    
    filterStr += `,fps=${fps.toFixed(3)}[${vLabel}]`;
    
    filterChunks.push(filterStr);
    concatInputs.push(`[${vLabel}]`);
});
```

---

### **Solution 3: Tách riêng slow motion và speed up**

```typescript
segments.forEach((seg, i) => {
    const vLabel = `v${i}`;
    const start = seg.videoStart.toFixed(4);
    const end = seg.videoEnd.toFixed(4);
    const speed = seg.videoSpeed;
    
    let filterStr = `[0:v]trim=start=${start}:end=${end}`;
    
    if (speed > 1.0) {
        // Slow motion: Cần làm video dài ra
        // Dùng setpts với multiplier < 1.0
        const slowFactor = (1.0 / speed).toFixed(4);
        filterStr += `,setpts=${slowFactor}*PTS`;
    } else if (speed < 1.0) {
        // Speed up: Cần làm video ngắn lại
        // Dùng setpts với multiplier > 1.0
        const speedFactor = (1.0 / speed).toFixed(4);
        filterStr += `,setpts=${speedFactor}*PTS`;
    } else {
        // Normal speed
        filterStr += `,setpts=PTS-STARTPTS`;
    }
    
    // Apply fps sau cùng
    filterStr += `,fps=${fps.toFixed(3)}[${vLabel}]`;
    
    filterChunks.push(filterStr);
    concatInputs.push(`[${vLabel}]`);
});
```

---

## 🧪 TEST CASES

### **Test Case 1: Audio dài hơn video (ratio > 1.3)**
```
originalDuration = 10s
audioDuration = 15s
ratio = 1.5

audioSpeed = 1.3
targetDuration = 15 / 1.3 = 11.54s
videoSpeed = 11.54 / 10 = 1.154

Expected: Video 10s → 11.54s (slow motion)
Current bug: Video bị frozen frames
Fix: setpts=(1/1.154)*PTS = 0.867*PTS ✅
```

### **Test Case 2: Audio hơi dài (1.0 < ratio <= 1.3)**
```
originalDuration = 10s
audioDuration = 12s
ratio = 1.2

audioSpeed = 1.2
targetDuration = 10s (giữ nguyên)
videoSpeed = 1.0

Expected: Video 10s → 10s (không thay đổi)
Current: OK ✅
```

### **Test Case 3: Audio ngắn hơn video**
```
originalDuration = 10s
audioDuration = 8s
ratio = 0.8

audioSpeed = 1.0
targetDuration = 10s
videoSpeed = 1.0

Expected: Video 10s → 10s (không thay đổi)
Current: OK ✅
```

---

## 📋 IMPLEMENTATION PLAN

### **Step 1: Fix setpts logic**
- Sửa công thức từ `setpts=${speed}*(PTS-STARTPTS)` 
- Thành `setpts=(1/${speed})*PTS` hoặc `setpts=PTS/${speed}`

### **Step 2: Add conditional setpts**
- Chỉ apply setpts khi `videoSpeed != 1.0`
- Khi `videoSpeed = 1.0`, dùng `setpts=PTS-STARTPTS`

### **Step 3: Verify fps filter placement**
- Đảm bảo fps filter được apply sau setpts
- Xem xét có cần fps filter không (có thể gây duplicate frames)

### **Step 4: Add debug logging**
- Log filter string cho mỗi segment
- Verify setpts values

### **Step 5: Test với video thực tế**
- Test với các ratio khác nhau
- Verify không có frozen frames

---

## 🔧 CODE FIX

Tôi sẽ implement Solution 1 (recommended) vì:
- Rõ ràng và dễ hiểu
- Xử lý đúng cả slow motion và speed up
- Có conditional logic cho videoSpeed = 1.0
- Maintain PTS continuity

---

**Bạn muốn tôi implement fix này ngay không?**
