import path from 'path';
import fs from 'fs';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ITtsEngine } from './ITtsEngine';

export class EdgeTtsEngine implements ITtsEngine {
  readonly engineId = 'edge-tts';

  async synthesize(text: string, voiceId: string): Promise<Readable> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    return audioStream;
  }

  async close(): Promise<void> {
    // MsEdgeTTS instances are created per-request and closed via stream end
  }

  /**
   * Synthesize to a file. Returns true on success, false on failure.
   */
  async synthesizeToFile(
    text: string,
    voiceId: string,
    outputPath: string,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      console.log(`Skipping empty text for ${outputPath}`);
      return false;
    }

    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(cleanText);

      return new Promise<boolean>((resolve) => {
        const writeStream = fs.createWriteStream(outputPath);
        let hasData = false;
        let finalized = false;

        const done = (success: boolean) => {
          if (finalized) return;
          finalized = true;
          clearTimeout(timer);
          resolve(success);
        };

        const timer = setTimeout(() => {
          console.error(`Timeout ${timeoutMs}ms for ${outputPath}`);
          audioStream.destroy();
          writeStream.end(() => {
            tts.close();
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            done(false);
          });
        }, timeoutMs);

        audioStream.on('data', (chunk: Buffer) => {
          hasData = true;
          writeStream.write(chunk);
        });

        audioStream.on('end', () => {
          writeStream.end(() => {
            tts.close();
            if (hasData && fs.existsSync(outputPath)) {
              const stat = fs.statSync(outputPath);
              if (stat.size > 0) {
                done(true);
              } else {
                fs.unlinkSync(outputPath);
                done(false);
              }
            } else {
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
              done(false);
            }
          });
        });

        audioStream.on('error', (err: Error) => {
          console.error(`Edge TTS stream error for ${outputPath}:`, err);
          writeStream.end(() => {
            tts.close();
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            done(false);
          });
        });
      });
    } catch (err) {
      console.error(`Edge TTS error for ${outputPath}:`, err);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      return false;
    }
  }
}