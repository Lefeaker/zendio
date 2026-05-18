import { describe, expect, it } from 'vitest';

import {
  sanitizeString,
  sanitizeUrl,
  sanitizeContext,
  sanitizeErrorForAnalytics
} from '@shared/errors/analytics/dataSanitizer';
import { ErrorSeverity, type AppError } from '@shared/errors/types';

describe('dataSanitizer', () => {
  it('redacts sensitive values from plain strings', () => {
    const input =
      'email test@example.com ip 127.0.0.1 user:alice ssn 123-45-6789 card 4111 1111 1111 1111';
    const sanitized = sanitizeString(input);

    expect(sanitized).toContain('[EMAIL_REDACTED]');
    expect(sanitized).toContain('[IP_REDACTED]');
    expect(sanitized).toContain('[USERNAME_REDACTED]');
    expect(sanitized).toContain('[SSN_REDACTED]');
    expect(sanitized).toContain('[CARD_REDACTED]');
  });

  it('redacts sensitive url parts and user path segments', () => {
    const sanitized = sanitizeUrl('https://example.com/users/alice/profile?token=secret&id=123');
    expect(sanitized).toContain('[PATH_REDACTED]');
    expect(sanitized).toContain('[PARAM_REDACTED]');
  });

  it('sanitizes nested context objects and arrays while redacting sensitive keys', () => {
    const context = sanitizeContext({
      password: 'secret',
      profileUrl: 'https://example.com/users/bob?api_key=abc',
      nested: { email: 'bob@example.com', step: 'parse' },
      items: ['user=carol', { path: '/Users/mac/Desktop/file.md' }, 3]
    });

    expect(context.password).toBe('[REDACTED]');
    expect(String(context.profileUrl)).toContain('[PATH_REDACTED]');
    expect((context.nested as Record<string, unknown>).email).toBe('[REDACTED]');
    expect((context.nested as Record<string, unknown>).step).toBe('parse');
    expect(Array.isArray(context.items)).toBe(true);
    expect(String((context.items as unknown[])[0])).toContain('[USERNAME_REDACTED]');
    expect(String(((context.items as unknown[])[1] as Record<string, unknown>).path)).toContain(
      '[PATH_REDACTED]'
    );
  });

  it('sanitizes app errors for analytics payloads', () => {
    const error: AppError = {
      code: 'NETWORK_TIMEOUT',
      message: 'Failed for user bob@example.com',
      domain: 'background',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      timestamp: Date.now(),
      context: {
        url: 'https://example.com/users/bob?token=abc',
        stack: 'Error\n at fn (https://example.com/file.js:12:8)'
      }
    };

    const sanitized = sanitizeErrorForAnalytics(error);
    expect(sanitized.message).toContain('[USERNAME_REDACTED]');
    expect(String(sanitized.context?.url)).toContain('[PATH_REDACTED]');
  });
});
