import { generateFinalVideo } from './src/services/FinalVideoService';
import path from 'path';

const projectPath = 'C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot';

console.log('Testing segment-by-segment encoding approach...');
console.log('Project:', projectPath);
console.log('');

generateFinalVideo(
    projectPath,
    (progress) => {
        console.log(`[${progress.status}] ${progress.progress}% - ${progress.detail}`);
        if (progress.current && progress.total) {
            console.log(`  Progress: ${progress.current}/${progress.total}`);
        }
    }
).then((result) => {
    if (result) {
        console.log('\n✅ SUCCESS!');
        console.log('Output:', result);
    } else {
        console.log('\n❌ FAILED!');
    }
}).catch((err) => {
    console.error('\n❌ ERROR:', err);
});
