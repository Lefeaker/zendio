/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { ReadingSection } from '@options/components/sections/ReadingSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import { MockOptionsRepository } from '../../../utils/repositories';

const readingMocks = vi.hoisted(() => {
  const scheduleAutoSave = vi.fn();
  return { scheduleAutoSave };
}) as {
  scheduleAutoSave: ReturnType<typeof vi.fn>;
};

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({
    scheduleAutoSave: readingMocks.scheduleAutoSave
  }),
  markPendingAutoSave: vi.fn()
}));

const noopStateManager = {} as OptionsStateManager;

describe('ReadingSection', () => {
  let registry: FormSectionRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<section id="reading-section"></section>';
    registry = new FormSectionRegistry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = (): { section: ReadingSection; repo: MockOptionsRepository } => {
    const container = document.getElementById('reading-section');
    if (!container) {
      throw new Error('Reading container missing');
    }
    const repo = new MockOptionsRepository();
    const section = new ReadingSection(container, repo);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return { section, repo };
  };

  it('applies snapshot, responds to interactions, and collects changes', async () => {
    const { section, repo } = renderSection();
    const snapshot = {
      readingSession: {
        exportMode: 'highlights',
        highlightTheme: 'purple'
      }
    } as StoredOptions;

    await registry.apply(snapshot);

    const modeSelect = document.getElementById('readingExportMode') as HTMLSelectElement;
    expect(modeSelect.value).toBe('highlights');

    const selectedButton = document.querySelector<HTMLButtonElement>('button[role="radio"][aria-checked="true"]');
    expect(selectedButton?.dataset.theme).toBe('purple');

    modeSelect.value = 'full';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const neonGreenButton = document.querySelector<HTMLButtonElement>('button[data-theme="neonGreen"]');
    expect(neonGreenButton).toBeTruthy();
    neonGreenButton?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(readingMocks.scheduleAutoSave).toHaveBeenCalledTimes(2);

    const collected = registry.collect(snapshot);
    expect(collected.readingSession).toEqual({
      exportMode: 'full',
      highlightTheme: 'neonGreen'
    });
    await vi.waitFor(() => {
      expect(repo.getMockData().readingSession?.exportMode).toBe('full');
    });

    section.destroy();
  });

  it('falls back to defaults when snapshot is missing fields', async () => {
    const { section, repo } = renderSection();
    const emptySnapshot = {} as StoredOptions;
    await registry.apply(emptySnapshot);

    const buttons = document.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
    const active = Array.from(buttons).find((button) => button.getAttribute('aria-checked') === 'true');
    expect(active?.dataset.theme).toBe('gradient');

    const collected = registry.collect(null);
    expect(collected.readingSession).toEqual({
      exportMode: 'highlights',
      highlightTheme: 'gradient'
    });
    await vi.waitFor(() => {
      expect(repo.getMockData().readingSession?.highlightTheme).toBe('gradient');
    });

    section.destroy();
  });

  it('updates UI when repository snapshot changes and stops after destroy', async () => {
    const { section, repo } = renderSection();
    const applySpy = vi.spyOn(section as unknown as { applySnapshot: (options: StoredOptions) => void }, 'applySnapshot');

    await repo.set({
      readingSession: {
        exportMode: 'full',
        highlightTheme: 'neonOrange'
      }
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      const modeSelect = document.getElementById('readingExportMode') as HTMLSelectElement | null;
      expect(modeSelect?.value).toBe('full');
      const activeButton = document.querySelector<HTMLButtonElement>('button[aria-checked="true"]');
      expect(activeButton?.dataset.theme).toBe('neonOrange');
    });

    section.destroy();
    applySpy.mockClear();
    await repo.set({
      readingSession: {
        exportMode: 'highlights',
        highlightTheme: 'purple'
      }
    } as Partial<CompleteOptions>);
    expect(applySpy).not.toHaveBeenCalled();
  });
});
