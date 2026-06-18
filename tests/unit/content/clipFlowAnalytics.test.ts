import { describe, expect, it } from 'vitest';
import { ErrorSeverity, classifierErrors, extractionErrors, type AppError } from '@shared/errors';
import { resolveClipExtractionFailureCategory } from '@content/runtime/clipFlowAnalytics';

describe('resolveClipExtractionFailureCategory', () => {
  it('classifies extraction-specific failures with bounded analytics categories', () => {
    const genericExtractionError: AppError = {
      code: 'EXTRACTION_STAGE_FAILURE',
      domain: 'extraction',
      message: 'Extractor failed without a narrower hint',
      severity: ErrorSeverity.ERROR,
      recoverable: false
    };

    expect(resolveClipExtractionFailureCategory(genericExtractionError)).toBe('extraction');
    expect(resolveClipExtractionFailureCategory(extractionErrors.noMarkdown())).toBe('validation');
    expect(resolveClipExtractionFailureCategory(extractionErrors.unsupportedContent())).toBe(
      'unsupported'
    );
  });

  it('classifies classifier failures without leaking raw failure details', () => {
    const genericClassifierError: AppError = {
      code: 'CLASSIFIER_STAGE_FAILURE',
      domain: 'classifier',
      message: 'Classifier stage failed without a narrower hint',
      severity: ErrorSeverity.ERROR,
      recoverable: true
    };

    expect(resolveClipExtractionFailureCategory(genericClassifierError)).toBe('classification');
    expect(
      resolveClipExtractionFailureCategory(
        classifierErrors.transportFailure('Failed to fetch classifier payload')
      )
    ).toBe('connection');
    expect(resolveClipExtractionFailureCategory(classifierErrors.timeout())).toBe('timeout');
  });

  it('classifies permission, validation, connection, and unknown fallback errors', () => {
    expect(
      resolveClipExtractionFailureCategory(new DOMException('Permission denied', 'SecurityError'))
    ).toBe('permission');
    expect(resolveClipExtractionFailureCategory(new Error('Malformed clip payload received'))).toBe(
      'validation'
    );
    expect(
      resolveClipExtractionFailureCategory(
        new Error('Could not establish connection to background runtime')
      )
    ).toBe('connection');
    expect(resolveClipExtractionFailureCategory(new Error('boom'))).toBe('unknown');
  });
});
