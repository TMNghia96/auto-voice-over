import { Segment, ValidatedSegment } from './types';

/**
 * Validates and adjusts video segments based on actual audio durations
 */
export class SegmentValidator {
  private readonly MIN_SPEED = 0.5;
  private readonly MAX_SPEED = 2.0;

  /**
   * Validates segments and calculates adjusted video speeds based on actual audio durations
   * 
   * @param segments - Array of video segments to validate
   * @param actualAudioDurations - Array of actual audio durations (from rendered audio files)
   * @param videoDuration - Total duration of the original video
   * @returns Array of validated segments with adjusted speeds
   */
  validateAndAdjust(
    segments: Segment[],
    actualAudioDurations: number[],
    videoDuration: number
  ): ValidatedSegment[] {
    // Validate input lengths match
    if (segments.length !== actualAudioDurations.length) {
      throw new Error(
        `Segments and actualAudioDurations length mismatch: ${segments.length} vs ${actualAudioDurations.length}`
      );
    }

    return segments.map((segment, index) => {
      const actualAudioDuration = actualAudioDurations[index];
      const originalVideoDuration = segment.videoDuration;

      // Calculate video speed to match audio duration
      // If video is 5s and audio is 4s, speed = 5/4 = 1.25 (speed up)
      // If video is 3s and audio is 5s, speed = 3/5 = 0.6 (slow down)
      const adjustedVideoSpeed = this.roundToDecimal(
        originalVideoDuration / actualAudioDuration,
        4
      );

      // Check if segment is beyond video duration
      if (segment.videoStart >= videoDuration) {
        console.warn(
          `Segment ${index}: videoStart ${segment.videoStart} is beyond video duration ${videoDuration}. ` +
          `Will need to create freeze frame or black video.`
        );
      }

      // Validate speed bounds
      if (adjustedVideoSpeed < this.MIN_SPEED) {
        console.warn(
          `Segment ${index}: adjusted speed ${adjustedVideoSpeed.toFixed(2)} is below minimum ${this.MIN_SPEED}. ` +
          `Video may appear too slow.`
        );
      }

      if (adjustedVideoSpeed > this.MAX_SPEED) {
        console.warn(
          `Segment ${index}: adjusted speed ${adjustedVideoSpeed.toFixed(2)} is above maximum ${this.MAX_SPEED}. ` +
          `Video may appear too fast.`
        );
      }

      // Determine if slow motion is needed (speed < 1.0)
      const needsSlowMotion = adjustedVideoSpeed < 1.0;

      return {
        ...segment,
        adjustedVideoSpeed,
        adjustedDuration: actualAudioDuration,
        needsSlowMotion
      };
    });
  }

  /**
   * Round a number to specified decimal places
   */
  private roundToDecimal(value: number, decimals: number): number {
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
  }
}
