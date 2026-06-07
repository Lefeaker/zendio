import { describe, expect, it, vi } from 'vitest';
import {
  bucketCount,
  bucketDurationMs,
  createAnalyticsOperationId,
  createFeatureTimer
} from '../../../src/shared/analytics';

describe('analytics feature timer', () => {
  it('creates short safe operation ids', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    try {
      expect(createAnalyticsOperationId(() => 1000)).toMatch(/^op_[a-z0-9]{6,24}$/);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('buckets durations with stable boundaries', () => {
    expect(bucketDurationMs(-1)).toBe('under_100ms');
    expect(bucketDurationMs(99)).toBe('under_100ms');
    expect(bucketDurationMs(100)).toBe('100ms_to_499ms');
    expect(bucketDurationMs(500)).toBe('500ms_to_999ms');
    expect(bucketDurationMs(1000)).toBe('1s_to_2s');
    expect(bucketDurationMs(3000)).toBe('3s_to_9s');
    expect(bucketDurationMs(10000)).toBe('10s_to_29s');
    expect(bucketDurationMs(30000)).toBe('30s_to_119s');
    expect(bucketDurationMs(120000)).toBe('2m_plus');
  });

  it('buckets counts with stable boundaries', () => {
    expect(bucketCount(-1)).toBe('zero');
    expect(bucketCount(0)).toBe('zero');
    expect(bucketCount(1)).toBe('one');
    expect(bucketCount(2)).toBe('two_to_five');
    expect(bucketCount(6)).toBe('six_to_ten');
    expect(bucketCount(11)).toBe('eleven_to_twenty');
    expect(bucketCount(21)).toBe('twenty_one_to_fifty');
    expect(bucketCount(51)).toBe('fifty_one_plus');
  });

  it('measures elapsed time from a caller-provided clock', () => {
    let now = 100;
    const timer = createFeatureTimer(() => now, 'op_manual1');

    now = 375;

    expect(timer.operationId).toBe('op_manual1');
    expect(timer.startedAt).toBe(100);
    expect(timer.elapsedMs()).toBe(275);
    expect(timer.durationBucket()).toBe('100ms_to_499ms');
  });
});
