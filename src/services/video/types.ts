/**
 * Video encoding options for a single segment
 */
export interface EncodeOptions {
  startTime: number;
  duration: number;
  videoSpeed: number;
  fps: number;
  crf: number;
  preset: string;
}

/**
 * Result of encoding a video segment
 */
export interface EncodeResult {
  success: boolean;
  outputPath: string;
  fileSize: number;
  duration: number;
  error?: string;
}

/**
 * Segment with validated and adjusted timing parameters
 */
export interface ValidatedSegment {
  type: 'dubbed' | 'gap';
  index?: number;
  videoStart: number;
  videoEnd: number;
  videoDuration: number;
  audioPath?: string;
  audioDuration?: number;
  targetDuration: number;
  audioSpeed: number;
  videoSpeed: number;
  fadeStart?: boolean;
  fadeEnd?: boolean;
  adjustedVideoSpeed: number;
  adjustedDuration: number;
  needsSlowMotion: boolean;
}

/**
 * Configuration for video processor
 */
export interface VideoProcessorConfig {
  concurrency: number;
  maxRetries: number;
  retryDelay: number;
  encoderPreference: 'gpu' | 'cpu' | 'auto';
}

/**
 * Default video processor configuration
 */
export const DEFAULT_VIDEO_CONFIG: VideoProcessorConfig = {
  concurrency: 6,
  maxRetries: 3,
  retryDelay: 1000,
  encoderPreference: 'auto'
};
