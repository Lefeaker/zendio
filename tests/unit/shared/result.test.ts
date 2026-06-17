/**
 * Type tests for Result types.
 *
 * These tests verify that Result types work correctly for error handling
 * and provide proper type safety.
 */

import { describe, it, expect } from 'vitest';
import {
  type Result,
  success,
  failure,
  isSuccess,
  isFailure,
  unwrap,
  unwrapOr,
  map,
  mapError,
  flatMap,
  fromPromise,
  fromPromiseWith
} from '@shared/types/result';

describe('Result Types', () => {
  describe('Basic Result Operations', () => {
    it('should create success results', () => {
      const result = success('test data');

      expect(result.success).toBe(true);
      expect(result.data).toBe('test data');
      expect(isSuccess(result)).toBe(true);
      expect(isFailure(result)).toBe(false);
    });

    it('should create failure results', () => {
      const error = new Error('test error');
      const result = failure(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(isSuccess(result)).toBe(false);
      expect(isFailure(result)).toBe(true);
    });

    it('should unwrap success results', () => {
      const result = success(42);
      expect(unwrap(result)).toBe(42);
    });

    it('should throw when unwrapping failure results', () => {
      const error = new Error('test error');
      const result = failure(error);

      expect(() => unwrap(result)).toThrow('test error');
    });

    it('should unwrap with default values', () => {
      const successResult = success(42);
      const failureResult = failure(new Error('test'));

      expect(unwrapOr(successResult, 0)).toBe(42);
      expect(unwrapOr(failureResult, 0)).toBe(0);
    });
  });

  describe('Result Transformations', () => {
    it('should map success results', () => {
      const result = success(5);
      const mapped = map(result, (x: number) => x * 2);

      expect(isSuccess(mapped)).toBe(true);
      if (isSuccess(mapped)) {
        expect(mapped.data).toBe(10);
      }
    });

    it('should not map failure results', () => {
      const error = new Error('test error');
      const result = failure(error);
      const mapped = map(result, (x: number) => x * 2);

      expect(isFailure(mapped)).toBe(true);
      if (isFailure(mapped)) {
        expect(mapped.error).toBe(error);
      }
    });

    it('should map error results', () => {
      const originalError = new Error('original');
      const result = failure(originalError);
      const mapped = mapError(result, (err) => new Error(`mapped: ${err.message}`));

      expect(isFailure(mapped)).toBe(true);
      if (isFailure(mapped)) {
        expect(mapped.error.message).toBe('mapped: original');
      }
    });

    it('should flat map results', () => {
      const result = success(5);
      const flatMapped = flatMap(result, (x: number) => success(x * 2));

      expect(isSuccess(flatMapped)).toBe(true);
      if (isSuccess(flatMapped)) {
        expect(flatMapped.data).toBe(10);
      }

      const failureFlatMapped = flatMap(result, (_value) => failure(new Error('inner error')));
      expect(isFailure(failureFlatMapped)).toBe(true);
    });
  });

  describe('Async Result Operations', () => {
    it('should convert successful promises to results', async () => {
      const promise = Promise.resolve(42);
      const result = await fromPromise(promise);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe(42);
      }
    });

    it('should convert rejected promises to results', async () => {
      const promise = Promise.reject(new Error('async error'));
      const result = await fromPromise(promise);

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('async error');
      }
    });

    it('should convert promises with custom error mapping', async () => {
      const promise = Promise.reject('string error');
      const result = await fromPromiseWith(promise, (error) => ({
        code: 'CUSTOM_ERROR',
        message: String(error)
      }));

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('CUSTOM_ERROR');
        expect(result.error.message).toBe('string error');
      }
    });
  });

  describe('Type Safety', () => {
    it('should provide correct type narrowing', () => {
      const successResult: Result<number, Error> = success(42);
      const failureResult: Result<number, Error> = failure(new Error('boom'));

      if (isSuccess(successResult)) {
        // TypeScript should know result.data is number
        expect(typeof successResult.data).toBe('number');
        expect(successResult.data + 1).toBe(43);
      }

      if (isFailure(failureResult)) {
        // TypeScript should know result.error is Error
        expect(failureResult.error instanceof Error).toBe(true);
      }
    });

    it('should maintain type safety through transformations', () => {
      const numberResult: Result<number, Error> = success(5);
      const stringResult = map(numberResult, (n) => n.toString());

      if (isSuccess(stringResult)) {
        // TypeScript should know this is string
        expect(typeof stringResult.data).toBe('string');
        expect(stringResult.data.length).toBe(1);
      }
    });

    it('should work with generic error types', () => {
      interface CustomError {
        code: string;
        details: Record<string, unknown>;
      }

      const customError: CustomError = {
        code: 'CUSTOM',
        details: { info: 'test' }
      };

      const result: Result<string, CustomError> = failure(customError);

      if (isFailure(result)) {
        // TypeScript should know this is CustomError
        expect(result.error.code).toBe('CUSTOM');
        expect(result.error.details.info).toBe('test');
      }
    });
  });
});
