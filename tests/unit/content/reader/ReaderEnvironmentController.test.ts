/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { ReaderEnvironmentController } from '../../../../src/content/reader/environmentController';

vi.mock('../../../../src/content/i18n/context', () => ({
  ensureContentI18n: vi.fn(async () => ({
    registerDynamic: vi.fn()
  })),
  getContentI18nResource: vi.fn(() => null),
  getContentMessages: vi.fn(async () => null)
}));

describe('ReaderEnvironmentController', () => {
  it('loads fragment config once during start and then waits for option changes', async () => {
    const get = vi.fn().mockResolvedValue({});
    const onChange = vi.fn(() => vi.fn());
    const onFragmentConfigUpdate = vi.fn();
    const controller = new ReaderEnvironmentController(
      {
        doc: document,
        storage: {
          sync: {
            watchKey: vi.fn(() => vi.fn())
          }
        } as never,
        optionsRepository: { get, onChange } as never
      },
      {
        onMessagesUpdate: vi.fn(),
        onFragmentConfigUpdate
      }
    );

    await controller.start();

    expect(get).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    controller.stop();
  });
});
