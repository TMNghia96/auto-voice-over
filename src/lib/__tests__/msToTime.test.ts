import { describe, it, expect } from 'vitest';
import { msToTime } from '../SrtOptimizer';

describe('msToTime', () => {
  it('rounds float milliseconds to integer', () => {
    expect(msToTime(960.0160336707085)).toBe('00:00:00,960');
  });

  it('handles plain integer correctly', () => {
    expect(msToTime(1250)).toBe('00:00:01,250');
  });

  it('handles zero', () => {
    expect(msToTime(0)).toBe('00:00:00,000');
  });

  it('handles negative input by clamping to zero', () => {
    expect(msToTime(-100)).toBe('00:00:00,000');
  });

  it('formats hours correctly', () => {
    expect(msToTime(3723000)).toBe('01:02:03,000');
  });
});
