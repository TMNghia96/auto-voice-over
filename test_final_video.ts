import { createFinalVideo } from './src/services/FinalVideoService';
import path from 'path';

const projectPath = 'C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot';

console.log('[Test] Starting final video creation...');
console.log('[Test] Project path:', projectPath);

createFinalVideo(
    projectPath,
    (progress) => {
        console.log(`[Progress] ${progress.status} - ${progress.progress}% - ${progress.detail}`);
    },
    0.15,  // duckVolume
    0.5    // fadeDuration
).then((result) => {
    if (result) {
        console.log('[Test] ✅ Success! Output:', result);
    } else {
        console.log('[Test] ❌ Failed - returned null');
    }
}).catch((err) => {
    console.error('[Test] ❌ Error:', err);
    console.error('[Test] Stack:', err.stack);
});
