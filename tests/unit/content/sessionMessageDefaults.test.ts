import { afterEach, describe, expect, it, vi } from 'vitest';

describe('session message defaults', () => {
  afterEach(() => {
    vi.doUnmock('../../../src/i18n/catalog/runtimeFallbackMessages');
  });

  it('sources reader session defaults from the default runtime catalog', async () => {
    const actualFallbacks = await vi.importActual<
      typeof import('../../../src/i18n/catalog/runtimeFallbackMessages')
    >('../../../src/i18n/catalog/runtimeFallbackMessages');
    vi.doMock('../../../src/i18n/catalog/runtimeFallbackMessages', () => ({
      ...actualFallbacks,
      RUNTIME_FALLBACK_MESSAGES: {
        ...actualFallbacks.RUNTIME_FALLBACK_MESSAGES,
        readerPanelTitle: 'Reader title sentinel',
        readerHintFailure: 'Reader failure sentinel'
      }
    }));

    const { DEFAULT_SESSION_MESSAGES } =
      await import('../../../src/content/reader/sessionMessages');

    expect(DEFAULT_SESSION_MESSAGES.panel.title).toBe('Reader title sentinel');
    expect(DEFAULT_SESSION_MESSAGES.hintFailure).toBe('Reader failure sentinel');
  });

  it('sources video session defaults from the default runtime catalog', async () => {
    const actualFallbacks = await vi.importActual<
      typeof import('../../../src/i18n/catalog/runtimeFallbackMessages')
    >('../../../src/i18n/catalog/runtimeFallbackMessages');
    vi.doMock('../../../src/i18n/catalog/runtimeFallbackMessages', () => ({
      ...actualFallbacks,
      RUNTIME_FALLBACK_MESSAGES: {
        ...actualFallbacks.RUNTIME_FALLBACK_MESSAGES,
        videoPanelTitle: 'Video title sentinel',
        videoHintFailure: 'Video failure sentinel'
      }
    }));

    const { DEFAULT_SESSION_MESSAGES } = await import('../../../src/content/video/sessionMessages');

    expect(DEFAULT_SESSION_MESSAGES.panel.title).toBe('Video title sentinel');
    expect(DEFAULT_SESSION_MESSAGES.hintFailure).toBe('Video failure sentinel');
  });
});
