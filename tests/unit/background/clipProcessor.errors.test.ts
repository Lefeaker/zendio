import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErrorSeverity } from '@shared/errors';
import { ClipProcessingResultSchema } from '@shared/schemas';
import {
  classifyClipMock,
  createPayload,
  downloadMock,
  expectAnalyticsEvent,
  expectNoSensitiveValues,
  getOptionsMock,
  recordUsageMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  restoreClipProcessorHarnessMocks,
  selectVaultMock,
  templateOptions,
  trackUsageEventMock,
  writeMarkdownMock
} from './clipTestHarness';

describe('clipProcessor errors', () => {
  beforeEach(() => {
    vi.resetModules();
    resetClipProcessorHarnessMocks();
  });

  afterEach(() => {
    restoreClipProcessorHarnessMocks();
  });

  it('logs usage stats failures without throwing', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig: { baseUrl: 'https://default', vault: 'Vault', apiKey: 'key' },
      context: {}
    });
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'success'
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/foo.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockRejectedValue(new Error('usage failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    await expect(processClipPayload(createPayload())).resolves.toMatchObject({
      filePath: 'Articles/foo.md',
      destination: 'vault',
      restVault: 'Vault',
      storageTarget: 'rest-api'
    });

    expect(recordUsageMock).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[clipProcessor] Failed to record usage stats:',
      expect.any(Error)
    );
  });

  it('emits clip_save_failed with safe params and rethrows download failures', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    classifyClipMock.mockResolvedValue({
      type: 'article',
      topics: [],
      tags: [],
      status: 'success' as const
    });
    resolvePathMock.mockReturnValue('Private/failure-note.md');
    const downloadError = new Error('download failed');
    downloadMock.mockRejectedValue(downloadError);

    const { processClipPayload, readClipProcessingFailureCategory } =
      await import('../../../src/background/application/clipProcessor');
    let caught: unknown;
    try {
      await processClipPayload(
        createPayload({
          markdown: 'private failing markdown',
          title: 'Failure Secret',
          meta: {
            url: 'https://example.com/failure',
            exportDestination: { kind: 'downloads' },
            operationId: 'op_fail1234'
          }
        })
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(downloadError);
    expect(readClipProcessingFailureCategory(caught)).toBe('write');
    expect(Object.keys(caught as object)).not.toContain('failureCategory');

    const failedCall = trackUsageEventMock.mock.calls.at(-1);
    expectAnalyticsEvent(
      failedCall,
      'clip_save_failed',
      {
        operation_id: 'op_fail1234',
        storage_target: 'downloads',
        failure_category: 'write'
      },
      ['failure_category', 'operation_id', 'storage_target']
    );
    expectNoSensitiveValues(failedCall?.[1], [
      'Failure Secret',
      'private failing markdown',
      'https://example.com/failure',
      'failure-note.md'
    ]);
  });

  it('includes classificationWarning when classification falls back with error', async () => {
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { baseUrl: 'https://default', vault: 'Vault', apiKey: '' }
    });
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig: { baseUrl: 'https://default', vault: 'Vault', apiKey: 'key' },
      context: {}
    });
    const errorDetail = {
      code: 'TEST_ERROR',
      domain: 'classifier' as const,
      message: 'Classification failed',
      severity: ErrorSeverity.ERROR,
      recoverable: true
    };
    const classificationResult = {
      type: 'article',
      topics: [],
      tags: [],
      status: 'fallback' as const,
      fallbackReason: 'error' as const,
      errorDetail
    };
    classifyClipMock.mockResolvedValue(classificationResult);
    resolvePathMock.mockReturnValue('Articles/test.md');
    writeMarkdownMock.mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);

    const { processClipPayload } =
      await import('../../../src/background/application/clipProcessor');
    const result = await processClipPayload(createPayload());

    // Verify result includes classificationWarning
    expect(result.classificationWarning).toEqual(errorDetail);

    // Verify result conforms to Schema
    const parseResult = ClipProcessingResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });
});
