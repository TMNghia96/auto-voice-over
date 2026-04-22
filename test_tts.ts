import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'fs';

async function test() {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('vi-VN-NamMinhNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    
    // Test just the text
    const text = 'Vâng';
    console.log('\\nGenerating with stream for ' + text + ':');
    
    await new Promise((resolve) => {
        const { audioStream } = tts.toStream(text);
        const fileName = 'test_empty_clean.mp3';
        const ws = fs.createWriteStream(fileName);
        
        let hasData = false;
        audioStream.on('data', (chunk) => {
            hasData = true;
            ws.write(chunk);
        });
        audioStream.on('end', () => {
            ws.end(() => {
                console.log('Done stream clean. hasData: ' + hasData + ', size: ' + fs.statSync(fileName).size);
                resolve(true);
            });
        });
        audioStream.on('error', (err) => {
            console.error('Stream error:', err);
            resolve(false);
        });
    });
}

test().catch(console.error);
