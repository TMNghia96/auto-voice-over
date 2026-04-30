# Module: TTSService

## Nghiệp vụ (Business Logic)
- **Text to Speech (TTS)**: Chuyển đổi văn bản (phụ đề SRT) thành giọng nói AI chất lượng cao bằng Microsoft Edge TTS (msedge-tts).
- **Parallel Processing**: Hỗ trợ xử lý song song với adaptive concurrency (p-limit), tự động điều chỉnh dựa trên tỷ lệ thành công.
- **Voice Selection**: Người dùng có thể chọn giọng đọc từ 3-5 presets mỗi ngôn ngữ, hoặc chọn từ thư viện đầy đủ với bộ lọc tìm kiếm và giới tính.
- **Smart Preview**: Tạo 3 đoạn audio mẫu ngẫu nhiên trước khi generate toàn bộ, có cache 24h.
- **Retry System**: Tự động retry khi thất bại với exponential backoff, batch retry và individual retry.

## Reference Functions (Các hàm quan trọng)

- `generateAudioSegment(text, voiceName, outputPath, entry?, timeoutMs?)`: Tạo một đoạn âm thanh TTS đơn lẻ với timeout 30s.
- `generateAudioSegmentWithRetry(text, voiceName, outputPath, entry?, maxRetries?)`: Generate segment với retry logic (max 2 retries, backoff 1s/2s).
- `generateAllAudio(entries, langCode, outputDir, onProgress, concurrency?, voiceId?, signal?)`: Generate tất cả entries với parallel processing (concurrency > 1) hoặc sequential.
- `generateVoicePreview(entries, voiceId, projectDir, sampleCount?)`: Tạo preview 3 samples ngẫu nhiên, cache 24h.
- `cleanupOldPreviews(projectDir?)`: Xóa preview cache cũ hơn 7 ngày.
- `categorizeError(error)`: Phân loại lỗi TTS (network timeout, no internet, rate limited, disk full).
- `selectRandomEntries(entries, count)`: Chọn ngẫu nhiên entries từ giữa danh sách (tránh 2 đầu).

## Workflow (Luồng xử lý)
1. **Voice Selection**: Người dùng chọn giọng đọc qua VoiceSelector/VoiceModal, preference được lưu theo project + language.
2. **Preview (optional)**: Generate 3 samples ngẫu nhiên để kiểm tra giọng đọc, cache kết quả 24h.
3. **Parallel Generation**: Gọi `generateAllAudio` với adaptive concurrency (mặc định 5, tự điều chỉnh 1-15).
4. **Progress Tracking**: Mỗi entry có status riêng (generating/done/failed), progress bar cập nhật real-time.
5. **Retry & Error Handling**: Tự động retry, phân loại lỗi, hỗ trợ batch retry và individual retry.
6. **Cancellation**: Hỗ trợ AbortSignal để hủy giữa chừng.

## Lưu ý & Gotchas
- **Edge TTS**: Sử dụng `msedge-tts` library với output format 24kHz MP3. Cần kết nối internet để hoạt động.
- **Timeout**: Mỗi request có timeout 30s, nếu quá thời gian sẽ báo lỗi và retry.
- **Concurrency**: Mặc định 5 luồng song song, tự động giảm nếu gặp rate limit (>3 lần) hoặc tỷ lệ lỗi >20%.
- **Cache Preview**: Cache trong `.auto-voice-over/previews/{voiceId}/` với TTL 24h. Tự động cleanup sau 7 ngày.
- **Voice Preferences**: Lưu trong ProjectConfig, key là `voicePreference.{lang}`.
- **p-limit**: Sử dụng thư viện p-limit để kiểm soát số luồng song song, không phải Pipper/TCP socket.