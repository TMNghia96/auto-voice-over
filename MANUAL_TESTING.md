# Manual Testing Checklist

## Voice Selection
- [ ] Voice selector renders correctly in AudioGeneratePhase
- [ ] Dropdown shows 3 preset voices for the selected language
- [ ] "View all" / modal opens full voice library
- [ ] Search filters voices by name in modal
- [ ] Gender filter (Male/Female) works in modal
- [ ] Preview button appears next to each voice
- [ ] Voice selection persists after reopening the project

## Voice Preview
- [ ] Preview generates 3 audio samples from random entries
- [ ] Samples play sequentially with ~500ms gap
- [ ] Second preview for same voice is instant (cache hit)
- [ ] Loading state visible during preview generation
- [ ] Preview plays correctly (audio audible, not corrupted)

## Parallel Generation
- [ ] Generate button starts audio generation
- [ ] Progress bar updates smoothly during generation
- [ ] Individual entries show generating/done/failed states
- [ ] Generation is noticeably faster than sequential (3-5x)
- [ ] Concurrency adapts on errors (can verify in console logs)

## Retry System
- [ ] Auto-retry on failure (max 2 retries with backoff)
- [ ] Batch retry button works for all failed entries
- [ ] Individual retry button works per entry
- [ ] Attempt counter increments on retries

## Cancellation
- [ ] Cancel button appears during generation
- [ ] Generation stops promptly on cancel
- [ ] Already-completed files are preserved on cancel
- [ ] Cancel + re-generate works correctly

## Edge Cases
- [ ] No internet shows clear error message ("No internet connection")
- [ ] Very long text (>1000 chars) is handled without crash
- [ ] Empty text entries are skipped silently
- [ ] Disk space check works (ENOSPC error handled)
- [ ] Rate limiting shows appropriate error message
- [ ] Timeout (30s) shows error and triggers retry