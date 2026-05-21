import type { ExtractionFailureContext } from '../types/extraction';

export type AppErrorCode = 'EXTRACTION_FAILED';

export interface ExtractionFailedError extends Error {
  code: AppErrorCode;
  context: ExtractionFailureContext;
  cause?: unknown;
}

export const AppErrors = {
  extractionFailed(
    context: ExtractionFailureContext,
    options?: { cause?: unknown }
  ): ExtractionFailedError {
    const error = new Error(`Extraction failed for ${context.type}`) as ExtractionFailedError;
    error.name = 'ExtractionFailedError';
    error.code = 'EXTRACTION_FAILED';
    error.context = context;
    if (options?.cause !== undefined) {
      (error as { cause?: unknown }).cause = options.cause;
    }
    return error;
  }
} as const;
