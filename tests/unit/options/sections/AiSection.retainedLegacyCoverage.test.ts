/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { AiSection } from '@options/components/sections/AiSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import { MockOptionsRepository } from '../../../utils/repositories';

const aiMocks = vi.hoisted(() => {
  const scheduleAutoSave = vi.fn();
  return { scheduleAutoSave };
}) as {
  scheduleAutoSave: ReturnType<typeof vi.fn>;
};

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({
    scheduleAutoSave: aiMocks.scheduleAutoSave
  }),
  markPendingAutoSave: vi.fn()
}));

const noopStateManager = {} as OptionsStateManager;

describe('AiSection', () => {
  let registry: FormSectionRegistry;
  let mockRepo: MockOptionsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<section id="ai-section"></section>';
    registry = new FormSectionRegistry();
    mockRepo = new MockOptionsRepository();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = (): AiSection => {
    const container = document.getElementById('ai-section');
    if (!container) {
      throw new Error('AI container missing');
    }
    const section = new AiSection(container, mockRepo);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return section;
  };

  it('applies snapshot, enforces timestamps, collects changes, and cleans up listeners', async () => {
    const section = renderSection();
    section.syncTimestampPolicy();

    const snapshot = {
      aiChat: {
        userName: 'Alex',
        includeTimestamps: true
      }
    } as StoredOptions;

    await registry.apply(snapshot);

    const input = document.getElementById('aiUserName') as HTMLInputElement;
    expect(input.value).toBe('Alex');

    const timestampToggle = document.getElementById('aiIncludeTimestamps') as HTMLInputElement;
    expect(timestampToggle.checked).toBe(false);
    expect(timestampToggle.disabled).toBe(true);

    input.value = 'Taylor';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(aiMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);

    const collected = registry.collect(snapshot);
    expect(collected.aiChat).toEqual({
      includeTimestamps: false,
      userName: 'Taylor'
    });

    const listenersBeforeDestroy = (mockRepo as unknown as { listeners: Set<unknown> }).listeners
      .size;
    expect(listenersBeforeDestroy).toBeGreaterThan(0);

    section.destroy();
    const listenersAfterDestroy = (mockRepo as unknown as { listeners: Set<unknown> }).listeners
      .size;
    expect(listenersAfterDestroy).toBe(0);
  });

  it('responds to repository updates and normalizes blank user names to USER', async () => {
    const section = renderSection();
    await registry.apply({} as StoredOptions);

    await mockRepo.set({
      aiChat: {
        userName: 'RepoUser',
        includeTimestamps: true
      }
    });

    const input = document.getElementById('aiUserName') as HTMLInputElement;
    await vi.waitFor(() => {
      expect(input.value).toBe('RepoUser');
    });

    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const collected = registry.collect(null);
    expect(collected.aiChat).toEqual({
      includeTimestamps: false,
      userName: 'USER'
    });

    section.destroy();
  });
});
