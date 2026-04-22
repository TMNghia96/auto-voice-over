import fs from 'fs';
import path from 'path';
import { createFinalVideo } from './src/services/FinalVideoService';

async function testSimplifiedService() {
    const projectPath = "C:\\Users\\tranm.DESKTOP-8VO69Q5\\Videos\\Aniverse\\200conongdot";
    
    console.log("--- BẮT ĐẦU TEST BẢN ĐƠN GIẢN HOÁ ---");
    console.log(`Project: ${projectPath}`);
    
    const startTime = Date.now();
    const result = await createFinalVideo(projectPath, (p) => {
        const percent = p.progress ? `${p.progress}%` : '';
        console.log(`[${p.status.toUpperCase()}] ${percent} ${p.detail}`);
    }, { backgroundVolume: 0.1 });
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    if (result) {
        console.log("--- TEST THÀNH CÔNG ---");
        console.log(`Kết quả: ${result}`);
        console.log(`Thời gian: ${elapsed}s`);
    } else {
        console.error("--- TEST THẤT BẠI ---");
    }
}

// Chạy test
testSimplifiedService().catch(err => {
    console.error("Fatal Error during test:", err);
});
