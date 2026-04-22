import fs from 'fs';

export interface SrtEntry {
    index: number;
    startTime: string;
    endTime: string;
    text: string;
}

/**
 * Parse SRT timestamp to milliseconds
 */
const timeToMs = (time: string): number => {
    const match = time.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) return 0;
    const [, h, m, s, ms] = match;
    return parseInt(h) * 3600000 + parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms);
};

/**
 * Convert milliseconds to SRT timestamp format
 */
const msToTime = (ms: number): string => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const msPart = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
};

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'vs', 'etc', 'ie', 'eg', 'đ', 'ông', 'bà', 'anh', 'chị']);

/**
 * Check if a character position is at a sentence boundary
 */
const isSentenceEnd = (text: string, pos: number): boolean => {
    if (pos < 0 || pos >= text.length) return false;
    const char = text[pos];

    if (char === '.' || char === '!' || char === '?') {
        // Check for abbreviations if the character is a period
        if (char === '.') {
            let wordStart = pos - 1;
            while (wordStart >= 0 && /[a-zA-ZáàảãạâấầẩẫậăắằẳẵặéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐ]/.test(text[wordStart])) {
                wordStart--;
            }
            const word = text.substring(wordStart + 1, pos).toLowerCase();
            if (ABBREVIATIONS.has(word)) return false;
        }

        const nextChar = pos + 1 < text.length ? text[pos + 1] : ' ';
        const nextNextChar = pos + 2 < text.length ? text[pos + 2] : '';

        // Added Unicode uppercase support \p{Lu}
        if (nextChar === ' ' && (nextNextChar === '' || /[\p{Lu}"'\u201C\u201D]/u.test(nextNextChar))) {
            return true;
        }
        if (pos === text.length - 1) return true;
    }
    return false;
};

/**
 * Interpolate a timestamp within a segment based on character position
 * Uses linear interpolation between start and end times
 */
const interpolateTime = (startMs: number, endMs: number, charPos: number, totalChars: number): number => {
    if (totalChars <= 0) return startMs;
    const ratio = Math.min(charPos / totalChars, 1.0);
    return Math.round(startMs + (endMs - startMs) * ratio);
};

export const parseSrt = (content: string): SrtEntry[] => {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const entries: SrtEntry[] = [];

    const blocks = normalized.trim().split(/\n\s*\n/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length >= 2) {
            const indexLine = lines[0].trim();
            const timeLine = lines[1].trim();

            const index = parseInt(indexLine, 10);
            if (isNaN(index)) continue;

            const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);

            if (timeMatch) {
                const text = lines.slice(2).join('\n').trim();
                entries.push({
                    index,
                    startTime: timeMatch[1].replace('.', ','),
                    endTime: timeMatch[2].replace('.', ','),
                    text,
                });
            }
        }
    }

    return entries;
};

export const stringifySrt = (entries: SrtEntry[]): string => {
    return entries.map(entry => {
        return `${entry.index}\n${entry.startTime} --> ${entry.endTime}\n${entry.text}\n`;
    }).join('\n');
};

/**
 * Optimize SRT segments
 * 
 * Strategy:
 * 0. Filter out single isolated words
 * 1. Merge small segments into a continuous stream with boundary checking
 * 1.5. Split exceptionally long segments
 * 2. Magnet logic for leftover isolated exclamations
 * 3. Expansion logic to prevent chipmunk voice
 */
export const optimizeSrt = (srtContent: string): string => {
    const originalSegments = parseSrt(srtContent);
    if (originalSegments.length === 0) return srtContent;

    // Pass 0: Remove isolated single-word segments (including interjections)
    const filteredSegments = originalSegments.filter(seg => {
        const cleanText = seg.text.replace(/[.,!?…—\-]/g, '').trim();
        if (!cleanText) return false;
        
        const words = cleanText.split(/\s+/);
        if (words.length <= 1) {
            return false;
        }
        return true;
    });

    if (filteredSegments.length === 0) return "";

    const mergedSegments: SrtEntry[] = [];
    let currentMerge: SrtEntry | null = null;
    
    // Maximum safe duration for a single subtitle on screen (7 seconds)
    const MAX_DURATION_MS = 7000;
    // Maximum gap between words to be considered the same stream
    const MAX_GAP_MS = 800;

    for (const seg of filteredSegments) {
        let text = seg.text.replace(/\s+/g, ' ').trim();
        if (!text) continue;

        if (!currentMerge) {
            currentMerge = { ...seg, text };
            continue;
        }

        const prevEndMs = timeToMs(currentMerge.endTime);
        const currStartMs = timeToMs(seg.startTime);
        const gap = currStartMs - prevEndMs;
        
        const combinedDuration = timeToMs(seg.endTime) - timeToMs(currentMerge.startTime);
        const prevText = currentMerge.text.trim();
        
        let shouldMerge = true;

        // 1. Force split if there's a long silence between segments
        if (gap > MAX_GAP_MS) {
            shouldMerge = false;
        }
        
        // 2. Force split if the previous segment ends with a sentence end
        if (shouldMerge) {
            const combinedText = prevText + ' ' + text;
            if (isSentenceEnd(combinedText, prevText.length - 1)) {
                shouldMerge = false;
            }
        }
        
        // 3. Force split if combined duration is too long
        if (shouldMerge && combinedDuration > MAX_DURATION_MS) {
            shouldMerge = false;
        }

        // 4. Force split if combined text is getting too long (e.g. > 90 chars)
        if (shouldMerge && (prevText.length + text.length > 90)) {
            shouldMerge = false;
        }

        if (shouldMerge) {
            // Append text and extend endTime
            currentMerge.text = currentMerge.text + ' ' + text;
            currentMerge.endTime = seg.endTime;
        } else {
            // Push current and start a new merge block
            mergedSegments.push(currentMerge);
            currentMerge = { ...seg, text };
        }
    }

    if (currentMerge) {
        mergedSegments.push(currentMerge);
    }

    // Pass 1.5: Split segments that are still exceptionally long
    const splitSegments: SrtEntry[] = [];
    const MAX_SEGMENT_DURATION_MS_SPLIT = 10000; // >= 10s is too long typically

    for (const seg of mergedSegments) {
        const startMs = timeToMs(seg.startTime);
        const endMs = timeToMs(seg.endTime);
        const duration = endMs - startMs;
        
        if (duration > MAX_SEGMENT_DURATION_MS_SPLIT && seg.text.length > 50) {
            let text = seg.text;
            let bestSplitIdx = -1;
            const mid = Math.floor(text.length / 2);
            let searchRadius = Math.floor(text.length / 3);
            
            // Search for punctuation / conjunctions near the middle
            const regex = /,[\s\n]+|[\s\n]+(và|nhưng|hoặc|mà|nên|vì|do)[\s\n]+/gi;
            let match;
            let closestDist = Infinity;
            
            while ((match = regex.exec(text)) !== null) {
                const matchIdx = match.index + (match[0].includes(',') ? 1 : 0);
                const dist = Math.abs(matchIdx - mid);
                if (dist <= searchRadius && dist < closestDist) {
                    closestDist = dist;
                    bestSplitIdx = matchIdx;
                }
            }
            
            if (bestSplitIdx === -1) {
                const spaceRegex = /[\s\n]+/g;
                while ((match = spaceRegex.exec(text)) !== null) {
                    const dist = Math.abs(match.index - mid);
                    if (dist <= searchRadius && dist < closestDist) {
                        closestDist = dist;
                        bestSplitIdx = match.index;
                    }
                }
            }
            
            if (bestSplitIdx > 0 && bestSplitIdx < text.length) {
                const part1 = text.substring(0, bestSplitIdx).trim();
                const part2 = text.substring(bestSplitIdx).trim();
                
                const splitTimeMs = interpolateTime(startMs, endMs, bestSplitIdx, text.length);
                
                splitSegments.push({
                    ...seg,
                    endTime: msToTime(splitTimeMs),
                    text: part1
                });
                splitSegments.push({
                    index: 0,
                    startTime: msToTime(splitTimeMs + 1),
                    endTime: seg.endTime,
                    text: part2
                });
            } else {
                splitSegments.push(seg);
            }
        } else {
            splitSegments.push(seg);
        }
    }

    // Pass 2: Magnet Logic (for leftover short isolated parts like "Oh!", "Vâng")
    const magnetSegments: SrtEntry[] = [];
    let i = 0;
    while (i < splitSegments.length) {
        let curr = { ...splitSegments[i] };
        let shouldPush = true;
        
        if (curr.text.trim().length <= 6) {
            let prev = magnetSegments.length > 0 ? magnetSegments[magnetSegments.length - 1] : null;
            let next = i + 1 < splitSegments.length ? { ...splitSegments[i + 1] } : null;
            
            let gapPrev = prev ? timeToMs(curr.startTime) - timeToMs(prev.endTime) : Infinity;
            let gapNext = next ? timeToMs(next.startTime) - timeToMs(curr.endTime) : Infinity;
            
            if (gapPrev <= 500 || gapNext <= 500) {
                if (gapPrev <= gapNext && prev) {
                    prev.text = prev.text + ' ' + curr.text;
                    prev.endTime = curr.endTime;
                    shouldPush = false;
                } else if (next) {
                    next.text = curr.text + ' ' + next.text;
                    next.startTime = curr.startTime;
                    splitSegments[i + 1] = next; // Update the array so the next iteration gets it
                    shouldPush = false;
                }
            }
        }
        
        if (shouldPush) {
            magnetSegments.push({ ...curr });
        }
        i++;
    }

    // Pass 3: Expansion logic (Padding duration) 
    // To prevent TTS from chunking out chipmunk-like voice clips
    const finalSegments: SrtEntry[] = [];
    for (let j = 0; j < magnetSegments.length; j++) {
        let curr = { ...magnetSegments[j] };
        
        let currStartMs = timeToMs(curr.startTime);
        let currEndMs = timeToMs(curr.endTime);
        let duration = currEndMs - currStartMs;
        
        if (duration < 1000) {
            let needed = 1000 - duration;
            
            let prev = j > 0 ? finalSegments[finalSegments.length - 1] : null;
            let maxExpandBack = prev ? (currStartMs - timeToMs(prev.endTime) - 10) : Infinity;
            if (maxExpandBack < 0) maxExpandBack = 0;
            
            let expandBackBy = Math.min(Math.floor(needed / 2), maxExpandBack);
            needed -= expandBackBy;
            currStartMs -= expandBackBy;
            
            let next = j + 1 < magnetSegments.length ? magnetSegments[j + 1] : null;
            let maxExpandForward = next ? (timeToMs(next.startTime) - currEndMs - 10) : Infinity;
            if (maxExpandForward < 0) maxExpandForward = 0;
            
            let expandForwardBy = Math.min(needed, maxExpandForward);
            needed -= expandForwardBy;
            currEndMs += expandForwardBy;
            
            // Try to compensate with backwards if forward didn't yield enough
            if (needed > 0 && expandBackBy < maxExpandBack) {
                let remainingMaxBack = maxExpandBack - expandBackBy;
                let extraBackBy = Math.min(needed, remainingMaxBack);
                currStartMs -= extraBackBy;
            }
            
            curr.startTime = msToTime(currStartMs);
            curr.endTime = msToTime(currEndMs);
        }
        
        // Re-index before pushing
        curr.index = j + 1;
        finalSegments.push(curr);
    }

    return finalSegments.map((seg, idx) => {
        // Re-index explicitly to be safe
        return `${idx + 1}\r\n${seg.startTime} --> ${seg.endTime}\r\n${seg.text}\r\n`;
    }).join('\r\n');
};

/**
 * Optimize an SRT file in place
 */
export const optimizeSrtFile = (srtPath: string): string => {
    const content = fs.readFileSync(srtPath, 'utf-8');
    const optimized = optimizeSrt(content);
    fs.writeFileSync(srtPath, optimized, 'utf-8');
    return optimized;
};

export const timeToSeconds = (time: string): number => {
    if (!time) return 0;

    const [hms, ms] = time.replace(',', '.').split('.');
    const parts = hms.split(':').map(Number);

    let seconds = 0;
    if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
    }

    const milliseconds = ms ? parseFloat(`0.${ms}`) : 0;

    return seconds + milliseconds;
};
