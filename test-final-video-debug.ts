// Import mock trước
import './test-mock-electron';

import { createFinalVideo, FinalVideoProgress } from './src/services/FinalVideoService';
import fs from 'fs';
import path from 'path';

const projectPath = 'C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot';

console.log('='.repeat(80));
console.log('TEST FINAL VIDEO RENDERING - PER-SEGMENT ADJUSTMENT');
console.log('='.repeat(80));

const startTime = Date.now();

createFinalVideo(
    projectPath,
    (progress: FinalVideoProgress) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}s] [${progress.status.toUpperCase().padEnd(12)}] ${progress.progress}% - ${progress.detail}`);
    },
    0.15,
    0.5
).then((result) => {
    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (result) {
        console.log('\n' + '='.repeat(80));
        console.log(`✓ THÀNH CÔNG! Video tại: ${result}`);
        if (fs.existsSync(result)) {
            const stats = fs.statSync(result);
            console.log(`  Kích thước: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        }
        console.log(`  Tổng thời gian: ${elapsedTotal}s`);
        console.log('='.repeat(80));
    } else {
        console.log('\n✗ THẤT BẠI!');
    }
    process.exit(result ? 0 : 1);
}).catch((err) => {
    console.error('✗ LỖI:', err);
    process.exit(1);
});