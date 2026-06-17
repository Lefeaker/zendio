import { describe, expect, it } from 'vitest';
import { normalizeToAppError } from '../../../../src/shared/errors/utils';
import { ErrorSeverity, isAppError } from '../../../../src/shared/errors/types';

describe('AppError descriptor guards', () => {
  it('rejects AppError-like objects with invalid user message descriptors', () => {
    const candidate = {
      code: 'BAD_DESCRIPTOR',
      domain: 'content',
      message: 'Descriptor is invalid',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessageDescriptor: {
        key: 42
      }
    };

    expect(isAppError(candidate)).toBe(false);

    const normalized = normalizeToAppError(candidate, {
      code: 'NORMALIZED_DESCRIPTOR',
      domain: 'content',
      defaultMessage: 'Normalized descriptor failure'
    });

    expect(normalized).not.toBe(candidate);
    expect(normalized).toMatchObject({
      code: 'NORMALIZED_DESCRIPTOR',
      domain: 'content',
      message: 'Normalized descriptor failure',
      userMessage: 'Normalized descriptor failure'
    });
    expect(normalized.userMessageDescriptor).toBeUndefined();
  });

  it('keeps valid descriptor-bearing AppError objects intact', () => {
    const candidate = {
      code: 'VALID_DESCRIPTOR',
      domain: 'content' as const,
      message: 'Descriptor is valid',
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessageDescriptor: {
        key: 'connection.failed',
        values: { status: 503, retryable: true },
        fallback: 'Connection failed'
      }
    };

    expect(isAppError(candidate)).toBe(true);
    expect(normalizeToAppError(candidate)).toBe(candidate);
  });

  it('uses descriptor-backed user messages without copying technical messages into userMessage', () => {
    const normalized = normalizeToAppError(new Error('provider timeout'), {
      code: 'NORMALIZED_DESCRIPTOR',
      domain: 'content',
      userMessageDescriptor: { key: 'clipFailed' }
    });

    expect(normalized.message).toBe('provider timeout');
    expect(normalized.userMessage).toBeUndefined();
    expect(normalized.userMessageDescriptor).toEqual({ key: 'clipFailed' });
  });
});
