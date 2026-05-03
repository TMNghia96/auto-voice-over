import { Readable } from 'stream';

export interface ITtsEngine {
  readonly engineId: string;
  synthesize(text: string, voiceId: string): Promise<Readable>;
  close(): Promise<void>;
}