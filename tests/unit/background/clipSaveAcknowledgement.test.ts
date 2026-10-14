import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '@shared/errors';
import {
  classifyClipMock,
  createClipResultMessage,
  getOptionsMock,
  notifyFailureMock,
  notifySuccessMock,
  notifyWarningMock,
  recordUsageMock,
  resetClipProcessorHarnessMocks,
  resolvePathMock,
  selectVaultMock,
  templateOptions,
  writeMarkdownMock
} from './clipTestHarness';

describe('clip business acknowledgement independent of secondary effects', () => {
  const output = new Map<string, string>();

  beforeEach(() => {
    vi.useFakeTimers();
    resetClipProcessorHarnessMocks();
    output.clear();
    getOptionsMock.mockResolvedValue({
      templates: templateOptions,
      domainMappings: {},
      rest: { vault: 'Test', apiKey: 'fixture', baseUrl: 'http://localhost' }
    });
    classifyClipMock.mockResolvedValue({
      type: 'article',
      topics: [],
      tags: [],
      status: 'success'
    });
    resolvePathMock.mockReturnValue('Reading/ack.md');
    selectVaultMock.mockReturnValue({
      vault: null,
      restConfig: { vault: 'Test', apiKey: 'fixture', baseUrl: 'http://localhost' },
      context: {}
    });
    writeMarkdownMock.mockImplementation((path: string, markdown: string) => {
      output.set(path, markdown);
      return Promise.resolve();
    });
    notifySuccessMock.mockReset().mockResolvedValue(undefined);
    notifyFailureMock.mockReset().mockResolvedValue(undefined);
    notifyWarningMock.mockReset().mockResolvedValue(undefined);
    recordUsageMock.mockResolvedValue(undefined);
    errorHandler.clearReporters();
  });

  afterEach(() => {
    errorHandler.clearReporters();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(['notification', 'usage', 'learning'] as const)(
    'acknowledges completed write when %s never settles',
    async (effect) => {
      const { handleClipResult } = await import('../../../src/background/pipelines/clipPipeline');
      const learning = await import('../../../src/background/services/learningProgress');
      const hanging =
        effect === 'notification'
          ? notifySuccessMock
          : effect === 'usage'
            ? recordUsageMock
            : vi.spyOn(learning, 'recordLearningExport');
      hanging.mockImplementation(() => new Promise(() => {}));
      const response = vi.fn();
      void handleClipResult(createClipResultMessage(), 1, {
        sendSupportPrompt: vi.fn().mockResolvedValue(undefined)
      }).then(response);
      await vi.advanceTimersByTimeAsync(100);
      expect(output.get('Reading/ack.md')).toBe('# note');
      expect(writeMarkdownMock).toHaveBeenCalledTimes(1);
      expect(hanging).toHaveBeenCalledTimes(1);
      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, filePath: 'Reading/ack.md' })
      );
    }
  );

  it('returns failure when an error reporter never settles', async () => {
    const { handleClipResult } = await import('../../../src/background/pipelines/clipPipeline');
    const report = vi.fn(() => new Promise<void>(() => {}));
    errorHandler.addReporter({ report });
    writeMarkdownMock.mockRejectedValue(new Error('write rejected'));
    const response = vi.fn();
    void handleClipResult(createClipResultMessage(), 1, {
      sendSupportPrompt: vi.fn().mockResolvedValue(undefined)
    }).then(response);
    await vi.advanceTimersByTimeAsync(100);
    expect(writeMarkdownMock).toHaveBeenCalledTimes(1);
    expect(output.size).toBe(0);
    expect(report).toHaveBeenCalledTimes(1);
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
