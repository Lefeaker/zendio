import { createMemoryStorageService } from '../../../../src/platform/preview/memoryStorage';
import { MockOptionsRepository } from '../../../utils/repositories/MockOptionsRepository';
import { createReaderPanelViewFactory } from '@content/reader/presentation/readerPanelView';
import { ReaderSessionExporter } from '@content/reader/services/exporter';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createReaderSessionDependencies } from '@content/reader/sessionDependencies';
import { DI_TOKENS } from '@shared/di/tokens';

const resolveRepository = vi.fn<(...args: unknown[]) => unknown>();

vi.mock('@shared/di/serviceRegistry', () => ({
  resolveRepository: (...args: unknown[]) => resolveRepository(...args)
}));

describe('createReaderSessionDependencies', () => {
  beforeEach(() => {
    resolveRepository.mockReset();
  });

  it('builds the default dependency graph from platform services', async () => {
    const readerRepository = { type: 'readerRepository' };
    resolveRepository.mockImplementation((token) => {
      expect(token).toBe(DI_TOKENS.IReaderRepository);
      return readerRepository;
    });

    const messaging = { send: vi.fn().mockResolvedValue({ success: true, filePath: 'note.md' }) };
    const deps = createReaderSessionDependencies({
      optionsRepository: new MockOptionsRepository(),
      storage: createMemoryStorageService(),
      messaging,
      runtime: {
        getURL: (path: string) => `chrome-extension://reader/${path}`
      }
    });

    expect(deps.readerRepository).toBe(readerRepository);
    expect(deps.viewFactory).toBeDefined();
    expect(typeof deps.createHighlightManager).toBe('function');
    expect(typeof deps.createSelectionController).toBe('function');
    expect(typeof deps.createPanelCoordinator).toBe('function');
    expect(typeof deps.createEnvironmentController).toBe('function');
    expect(typeof deps.createLifecycle).toBe('function');

    await expect(deps.dispatchClipResult({ markdown: '# hi' })).resolves.toBeUndefined();
    expect(messaging.send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# hi' }
    });
  });

  it.each([undefined, { success: false }, { success: 'true' }])(
    'rejects an unconfirmed background save: %s',
    async (reply) => {
      resolveRepository.mockReturnValue({});
      const deps = createReaderSessionDependencies({
        optionsRepository: new MockOptionsRepository(),
        storage: createMemoryStorageService(),
        messaging: { send: vi.fn().mockResolvedValue(reply) },
        runtime: { getURL: (path) => path }
      });
      await expect(deps.dispatchClipResult({ markdown: '# keep me' })).rejects.toThrow();
    }
  );

  it('honors dependency overrides', async () => {
    resolveRepository.mockReturnValue({ type: 'readerRepository' });
    const viewFactory = createReaderPanelViewFactory({ resolveAssetUrl: (path) => path });
    const createHighlightManager = vi.fn();
    const createSelectionController = vi.fn();
    const createPanelCoordinator = vi.fn();
    const createEnvironmentController = vi.fn();
    const createLifecycle = vi.fn();
    const exporter = new ReaderSessionExporter({});
    const dispatchClipResult = vi.fn().mockResolvedValue(undefined);

    const deps = createReaderSessionDependencies(
      {
        optionsRepository: new MockOptionsRepository(),
        storage: createMemoryStorageService(),
        messaging: { send: vi.fn() },
        runtime: { getURL: vi.fn((path: string) => path) }
      },
      {
        viewFactory,
        createHighlightManager,
        createSelectionController,
        createPanelCoordinator,
        createEnvironmentController,
        createLifecycle,
        exporter,
        dispatchClipResult
      }
    );

    expect(deps.viewFactory).toBe(viewFactory);
    expect(deps.createHighlightManager).toBe(createHighlightManager);
    expect(deps.createSelectionController).toBe(createSelectionController);
    expect(deps.createPanelCoordinator).toBe(createPanelCoordinator);
    expect(deps.createEnvironmentController).toBe(createEnvironmentController);
    expect(deps.createLifecycle).toBe(createLifecycle);
    expect(deps.exporter).toBe(exporter);

    await deps.dispatchClipResult({ markdown: '# override' });
    expect(dispatchClipResult).toHaveBeenCalledWith({ markdown: '# override' });
  });
});
