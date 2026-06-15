import { AppError, ErrorSeverity } from './types';

interface ClassifierContext extends Record<string, unknown> {
  provider?: string;
  endpoint?: string;
  status?: number;
  payloadSample?: unknown;
}

export const classifierErrors = {
  transportFailure(
    message: string,
    context: ClassifierContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: 'CLASSIFIER_TRANSPORT_FAILURE',
      domain: 'classifier',
      message,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessageDescriptor: { key: 'errorClassifierTransportFailure' },
      context,
      cause: options.cause
    };
  },

  invalidPayload(
    message: string,
    context: ClassifierContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: 'CLASSIFIER_INVALID_PAYLOAD',
      domain: 'classifier',
      message,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessageDescriptor: { key: 'errorClassifierInvalidPayload' },
      context,
      cause: options.cause
    };
  },

  timeout(context: ClassifierContext = {}, options: { cause?: unknown } = {}): AppError {
    return {
      code: 'CLASSIFIER_TIMEOUT',
      domain: 'classifier',
      message: 'Classifier request timed out.',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessageDescriptor: { key: 'errorClassifierTimeout' },
      context,
      cause: options.cause
    };
  }
} as const;

export type ClassifierErrorCode = ReturnType<
  (typeof classifierErrors)[keyof typeof classifierErrors]
>['code'];
