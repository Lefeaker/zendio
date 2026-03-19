/**
 * Service layer Result types and utilities.
 * 
 * This module provides Result types specifically for background services,
 * with common error types and utility functions.
 */

import type { Result, Success, Failure } from '../../shared/types';
import { success, failure } from '../../shared/types';

// Common service error types
export interface ServiceError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: Error;
}

// Specific service error codes
export type ServiceErrorCode = 
  | 'STORAGE_ERROR'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'EXTERNAL_API_ERROR'
  | 'TIMEOUT_ERROR'
  | 'UNKNOWN_ERROR';

// Service result type
export type ServiceResult<T> = Result<T, ServiceError>;

// Service error factory functions
export function createServiceError(
  code: ServiceErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: Error
): ServiceError {
  return {
    code,
    message,
    ...(details !== undefined && { details }),
    ...(cause !== undefined && { cause })
  };
}

export function createStorageError(message: string, cause?: Error): ServiceError {
  return createServiceError('STORAGE_ERROR', message, undefined, cause);
}

export function createNetworkError(message: string, cause?: Error): ServiceError {
  return createServiceError('NETWORK_ERROR', message, undefined, cause);
}

export function createValidationError(message: string, details?: Record<string, unknown>): ServiceError {
  return createServiceError('VALIDATION_ERROR', message, details);
}

export function createPermissionError(message: string): ServiceError {
  return createServiceError('PERMISSION_ERROR', message);
}

export function createConfigurationError(message: string, details?: Record<string, unknown>): ServiceError {
  return createServiceError('CONFIGURATION_ERROR', message, details);
}

export function createExternalApiError(message: string, details?: Record<string, unknown>, cause?: Error): ServiceError {
  return createServiceError('EXTERNAL_API_ERROR', message, details, cause);
}

export function createTimeoutError(message: string): ServiceError {
  return createServiceError('TIMEOUT_ERROR', message);
}

export function createUnknownError(message: string, cause?: Error): ServiceError {
  return createServiceError('UNKNOWN_ERROR', message, undefined, cause);
}

// Service result factory functions
export function serviceSuccess<T>(data: T): Success<T> {
  return success(data);
}

export function serviceFailure(error: ServiceError): Failure<ServiceError> {
  return failure(error);
}

// Utility functions for service operations
export async function wrapServiceCall<T>(
  operation: () => Promise<T>,
  errorMapper?: (error: unknown) => ServiceError
): Promise<ServiceResult<T>> {
  try {
    const result = await operation();
    return serviceSuccess(result);
  } catch (error) {
    const serviceError = errorMapper 
      ? errorMapper(error)
      : createUnknownError(
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error : undefined
        );
    return serviceFailure(serviceError);
  }
}

// Common error mappers
export function mapStorageError(error: unknown): ServiceError {
  if (error instanceof Error) {
    return createStorageError(error.message, error);
  }
  return createStorageError(String(error));
}

export function mapNetworkError(error: unknown): ServiceError {
  if (error instanceof Error) {
    return createNetworkError(error.message, error);
  }
  return createNetworkError(String(error));
}

export function mapValidationError(error: unknown): ServiceError {
  if (error instanceof Error) {
    return createValidationError(error.message);
  }
  return createValidationError(String(error));
}

// Service operation decorators
export function withStorageErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<ServiceResult<R>> {
  return async (...args: T) => {
    return wrapServiceCall(() => fn(...args), mapStorageError);
  };
}

export function withNetworkErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<ServiceResult<R>> {
  return async (...args: T) => {
    return wrapServiceCall(() => fn(...args), mapNetworkError);
  };
}

export function withValidationErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<ServiceResult<R>> {
  return async (...args: T) => {
    return wrapServiceCall(() => fn(...args), mapValidationError);
  };
}

// Result transformation utilities
export function mapServiceResult<T, U>(
  result: ServiceResult<T>,
  mapper: (data: T) => U
): ServiceResult<U> {
  if (result.success) {
    return serviceSuccess(mapper(result.data));
  }
  return result as ServiceResult<U>;
}

export function flatMapServiceResult<T, U>(
  result: ServiceResult<T>,
  mapper: (data: T) => ServiceResult<U>
): ServiceResult<U> {
  if (result.success) {
    return mapper(result.data);
  }
  return result as ServiceResult<U>;
}

// Service result validation
export function validateServiceResult<T>(
  result: ServiceResult<T>,
  validator: (data: T) => boolean,
  errorMessage: string = 'Validation failed'
): ServiceResult<T> {
  if (result.success && !validator(result.data)) {
    return serviceFailure(createValidationError(errorMessage));
  }
  return result;
}

// Combine multiple service results
export function combineServiceResults<T extends readonly unknown[]>(
  ...results: { [K in keyof T]: ServiceResult<T[K]> }
): ServiceResult<T> {
  const data: unknown[] = [];
  
  for (const result of results) {
    if (!result.success) {
      return result as ServiceResult<T>;
    }
    data.push(result.data);
  }
  
  return serviceSuccess(data as unknown as T);
}

// Service result logging utilities
export function logServiceError(error: ServiceError, context?: string): void {
  const prefix = context ? `[${context}]` : '[Service]';
  console.error(`${prefix} ${error.code}: ${error.message}`, {
    details: error.details,
    cause: error.cause
  });
}

export function logServiceResult<T>(
  result: ServiceResult<T>,
  context?: string
): ServiceResult<T> {
  if (!result.success && 'error' in result) {
    logServiceError(result.error, context);
  }
  return result;
}

// Type guards
export function isServiceError(error: unknown): error is ServiceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

export function isServiceResult<T>(value: unknown): value is ServiceResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as Record<string, unknown>).success === 'boolean'
  );
}
