/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { DeepResearchSection } from '@options/components/sections/DeepResearchSection';
import type { OptionsStateManager } from '@options/state/StateManager';

const deepResearchMocks = vi.hoisted(() => {
  const scheduleAutoSave = vi.fn();
  return { scheduleAutoSave };
}) as {
  scheduleAutoSave: ReturnType<typeof vi.fn>;
};

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({
    scheduleAutoSave: deepResearchMocks.scheduleAutoSave
  }),
  markPendingAutoSave: vi.fn()
}));

const noopStateManager = {} as OptionsStateManager;

describe('DeepResearchSection', () => {
  let registry: FormSectionRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<section id="deep-research-section"></section>';
    registry = new FormSectionRegistry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = (): DeepResearchSection => {
    const container = document.getElementById('deep-research-section');
    if (!container) {
      throw new Error('DeepResearch container missing');
    }
    const section = new DeepResearchSection(container);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return section;
  };

  it('toggles pure mode and schedules auto save', () => {
    const section = renderSection();
    const toggle = document.getElementById('deepResearchPureMode') as HTMLInputElement;
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    expect(toggle.checked).toBe(false);

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(deepResearchMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);
    section.destroy();
  });

  it('applies snapshot and collects deep research settings', async () => {
    const section = renderSection();
    const snapshot = {
      deepResearch: {
        pureMode: true
      }
    } as StoredOptions;

    await registry.apply(snapshot);

    const toggle = document.getElementById('deepResearchPureMode') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    const previous = snapshot;
    const collected = registry.collect(previous);
    expect(collected.deepResearch).toEqual({
      pureMode: false
    });

    section.destroy();
  });
});
