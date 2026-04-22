import { getWindowsShortPath } from './src/lib/PathUtils';
import path from 'path';
import fs from 'fs';

const testDir = path.join(process.cwd(), 'Đạo lý 1');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

const testFile = path.join(testDir, 'Subtitle gốc.srt');
if (!fs.existsSync(testFile)) fs.writeFileSync(testFile, 'Test');

console.log('Original Dir:', testDir);
console.log('Short Dir:', getWindowsShortPath(testDir));

console.log('Original File:', testFile);
console.log('Short File:', getWindowsShortPath(testFile));
