/**
 * Result type for safe error handling.
 *
 * This type represents the result of an operation that can either succeed or fail.
 * It's used throughout the platform layer to provide consistent error handling.
 */

export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly success: true;
  readonly data: T;
}

export interface Failure<E> {
  readonly success: false;
  readonly error: E;
}

// Result constructors
export function success<T>(data: T): Success<T> {
  return { success: true, data };
}

export function failure<E>(error: E): Failure<E> {
  return { success: false, error };
}

// Result utilities
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success;
}

export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return !result.success;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (isSuccess(result)) {
    return result.data;
  }
  throw result.error;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isSuccess(result) ? result.data : defaultValue;
}

export function map<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  return isSuccess(result) ? success(fn(result.data)) : result;
}

export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isFailure(result) ? failure(fn(result.error)) : result;
}

export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  return isSuccess(result) ? fn(result.data) : result;
}

// Async Result utilities
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function fromPromiseWith<T, E>(
  promise: Promise<T>,
  errorMapper: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    return failure(errorMapper(error));
  }
}

// Chrome API specific error types
export interface ChromeApiError {
  readonly code: 'CHROME_API_ERROR';
  readonly message: string;
  readonly originalError?: chrome.runtime.LastError;
}

export function createChromeApiError(
  message: string,
  originalError?: chrome.runtime.LastError
): ChromeApiError {
  if (originalError !== undefined) {
    return {
      code: 'CHROME_API_ERROR',
      message,
      originalError
    };
  }

  return {
    code: 'CHROME_API_ERROR',
    message
  };
}

export async function fromChromeApi<T>(
  apiCall: () => Promise<T>
): Promise<Result<T, ChromeApiError>> {
  try {
    const data = await apiCall();

    // Check for Chrome runtime errors
    if (chrome.runtime.lastError) {
      return failure(
        createChromeApiError(
          chrome.runtime.lastError.message || 'Unknown Chrome API error',
          chrome.runtime.lastError
        )
      );
    }

    return success(data);
  } catch (error) {
    return failure(
      createChromeApiError(
        error instanceof Error ? error.message : String(error),
        chrome.runtime.lastError
      )
    );
  }
}

// Callback-based Chrome API wrapper
export function wrapChromeCallback<T>(
  apiCall: (callback: (result: T) => void) => void
): Promise<Result<T, ChromeApiError>> {
  return new Promise((resolve) => {
    apiCall((result) => {
      if (chrome.runtime.lastError) {
        resolve(
          failure(
            createChromeApiError(
              chrome.runtime.lastError.message || 'Unknown Chrome API error',
              chrome.runtime.lastError
            )
          )
        );
      } else {
        resolve(success(result));
      }
    });
  });
}
