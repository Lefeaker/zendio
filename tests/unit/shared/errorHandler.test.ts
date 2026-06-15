import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toSerializableAppError } from '@shared/errors';
import { errorHandler } from '@shared/errors/errorHandler';
import { ErrorSeverity } from '@shared/errors/types';
import type { AppError } from '@shared/errors/types';

describe('ErrorHandler', () => {
  const consoleSpies: Array<{ mockRestore(): void }> = [];

  beforeEach(() => {
    consoleSpies.push(vi.spyOn(console, 'info').mockImplementation(() => undefined));
    consoleSpies.push(vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    consoleSpies.push(vi.spyOn(console, 'error').mockImplementation(() => undefined));
    errorHandler.clearReporters();
    errorHandler.setNotificationBridge(null);
  });

  afterEach(() => {
    errorHandler.clearReporters();
    errorHandler.setNotificationBridge(null);
    while (consoleSpies.length > 0) {
      consoleSpies.pop()?.mockRestore();
    }
  });

  function createError(overrides: Partial<AppError> = {}): AppError {
    return {
      code: 'UNIT_TEST_FAILURE',
      domain: 'unknown',
      message: 'Unit test failure',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      ...overrides
    };
  }

  it('notifies registered reporters', async () => {
    const reporter = { report: vi.fn<(...args: [AppError]) => void>() };
    const remove = errorHandler.addReporter(reporter);
    const appError = createError();

    await errorHandler.handle(appError, { suppressNotifications: true });

    expect(reporter.report).toHaveBeenCalledTimes(1);
    expect(reporter.report).toHaveBeenCalledWith(expect.objectContaining({ code: appError.code }));
    remove();
  });

  it('invokes notification bridge when configured', async () => {
    const bridge = vi.fn();
    errorHandler.setNotificationBridge((error) => {
      bridge(error.code);
      return Promise.resolve();
    });
    const appError = createError();

    await errorHandler.handle(appError);
    expect(bridge).toHaveBeenCalledWith(appError.code);

    await errorHandler.handle(appError, { suppressNotifications: true });
    expect(bridge).toHaveBeenCalledTimes(1);
  });

  it('merges metadata into error context', async () => {
    const reporter = { report: vi.fn<(...args: [AppError]) => void>() };
    errorHandler.addReporter(reporter);
    const appError = createError({ context: { existing: true } });

    await errorHandler.handle(appError, {
      suppressNotifications: true,
      metadata: { requestId: 'req-123' }
    });

    const reportMock = vi.mocked(reporter.report);
    expect(reportMock).toHaveBeenCalledTimes(1);
    const reported = reportMock.mock.calls[0]?.[0];
    if (!reported) {
      throw new Error('Reporter did not receive error payload');
    }
    expect(reported.context).toMatchObject({
      existing: true,
      requestId: 'req-123'
    });
    expect(typeof reported.timestamp).toBe('number');
  });

  it('rethrows underlying cause when requested', async () => {
    const cause = new Error('underlying failure');
    const appError = createError({ cause });

    await expect(
      errorHandler.handle(appError, { rethrow: true, suppressNotifications: true })
    ).rejects.toBe(cause);
  });

  it('produces serializable error payloads', () => {
    const appError = createError({
      cause: new Error('network down'),
      context: {
        nested: { attempts: 2 },
        handler: () => undefined
      }
    });

    const serialized = toSerializableAppError(appError);
    expect(serialized).toMatchObject({
      code: appError.code,
      domain: appError.domain,
      recoverable: appError.recoverable
    });
    expect(serialized.cause).toMatchObject({
      name: 'Error',
      message: 'network down'
    });
    expect(serialized.context).toMatchObject({ nested: { attempts: 2 } });
    expect(serialized.context?.handler).toEqual(expect.any(String));
  });

  it('preserves descriptor-based user messages during serialization', () => {
    const appError = {
      ...createError({
        userMessage: 'Connection failed'
      }),
      userMessageDescriptor: {
        key: 'connection.failed',
        values: { retryable: true, status: 503 },
        fallback: 'Connection failed'
      }
    } as AppError & {
      userMessageDescriptor: {
        key: string;
        values: Record<string, boolean | number | string | null | undefined>;
        fallback: string;
      };
    };

    const serialized = toSerializableAppError(appError);

    expect(serialized).toMatchObject({
      userMessage: 'Connection failed',
      userMessageDescriptor: {
        key: 'connection.failed',
        values: { retryable: true, status: 503 },
        fallback: 'Connection failed'
      }
    });
  });
});
