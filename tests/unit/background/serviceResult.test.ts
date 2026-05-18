import { describe, expect, it, vi } from 'vitest';

import {
  createServiceError,
  createStorageError,
  serviceSuccess,
  serviceFailure,
  wrapServiceCall,
  withStorageErrorHandling,
  mapServiceResult,
  flatMapServiceResult,
  validateServiceResult,
  combineServiceResults,
  logServiceResult,
  isServiceError,
  isServiceResult
} from '../../../src/background/services/serviceResult';

describe('serviceResult', () => {
  it('creates service errors with optional fields', () => {
    const cause = new Error('boom');
    const error = createServiceError('STORAGE_ERROR', 'failed', { key: 'options' }, cause);
    expect(error).toEqual({
      code: 'STORAGE_ERROR',
      message: 'failed',
      details: { key: 'options' },
      cause
    });
    expect(createStorageError('storage failed').code).toBe('STORAGE_ERROR');
  });

  it('wraps successful and failed async service calls', async () => {
    await expect(wrapServiceCall(() => Promise.resolve(42))).resolves.toEqual(serviceSuccess(42));
    const result = await wrapServiceCall(() => Promise.reject(new Error('broken')));
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toMatchObject({ code: 'UNKNOWN_ERROR' });
    }
  });

  it('decorates storage calls and transforms results', async () => {
    const wrapped = withStorageErrorHandling((value: number) => Promise.resolve(value * 2));
    await expect(wrapped(3)).resolves.toEqual(serviceSuccess(6));

    const successResult = serviceSuccess(2);
    expect(mapServiceResult(successResult, (value) => value + 1)).toEqual(serviceSuccess(3));
    expect(flatMapServiceResult(successResult, (value) => serviceSuccess(String(value)))).toEqual(
      serviceSuccess('2')
    );
  });

  it('validates and combines results, and logs failures', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invalid = validateServiceResult(serviceSuccess(1), () => false, 'bad');
    expect(invalid.success).toBe(false);

    const combined = combineServiceResults(serviceSuccess('a'), serviceSuccess(2));
    expect(combined).toEqual(serviceSuccess(['a', 2]));

    const failed = serviceFailure(createStorageError('oops'));
    expect(logServiceResult(failed, 'Test')).toBe(failed);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(isServiceError(failed.error)).toBe(true);
    expect(isServiceResult(failed)).toBe(true);
    consoleErrorSpy.mockRestore();
  });
});
