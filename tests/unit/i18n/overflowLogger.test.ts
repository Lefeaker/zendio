import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdaptiveTextResult } from '@shared/i18n/textAdaptation';

const resolveRepositoryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/shared/di/serviceRegistry', () => ({
  resolveRepository: resolveRepositoryMock
}));

function createElementStub(dataset: Record<string, string> = {}): HTMLElement {
  const attrs = new Map<string, string>();
  return {
    dataset,
    getAttribute: (name: string) => attrs.get(name) ?? null
  } as unknown as HTMLElement;
}

describe('overflowLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      location: { pathname: '/options/index.html' }
    });
  });

  it('sends one overflow usage event through the messaging repository', async () => {
    const sendMock = vi.fn(() => Promise.resolve(undefined));
    resolveRepositoryMock.mockReturnValue({ send: sendMock });
    const { logTextOverflowEvent } = await import('../../../src/shared/i18n/overflowLogger');

    const element = createElementStub({
      budgetKey: 'clipButton',
      component: 'button',
      priority: 'high'
    });

    logTextOverflowEvent(element, {
      value: 'Very long label',
      usedShort: false,
      budget: { component: 'button', priority: 'high', mobile: 8, desktop: 10 },
      overLimit: true,
      language: 'en',
      length: 24,
      limit: 10
    });

    await Promise.resolve();

    expect(resolveRepositoryMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      type: 'TRACK_USAGE_EVENT',
      event: 'i18n_text_overflow',
      params: expect.objectContaining({
        key: 'clipButton',
        language: 'en',
        component: 'button',
        priority: 'high',
        length: 24,
        limit: 10
      })
    });
  });

  it('deduplicates overflow events per element and key', async () => {
    const sendMock = vi.fn(() => Promise.resolve(undefined));
    resolveRepositoryMock.mockReturnValue({ send: sendMock });
    const { logTextOverflowEvent } = await import('../../../src/shared/i18n/overflowLogger');

    const element = createElementStub({ budgetKey: 'readerPanel' });

    const result = {
      value: 'Too long',
      usedShort: false,
      budget: { component: 'label', priority: 'medium', mobile: 6, desktop: 8 },
      overLimit: true,
      language: 'en' as const,
      length: 12,
      limit: 8
    } satisfies AdaptiveTextResult;

    logTextOverflowEvent(element, result);
    logTextOverflowEvent(element, result);
    await Promise.resolve();

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
