/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CompleteOptions, FragmentClipperOptions, StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { FragmentSection } from '@options/components/sections/FragmentSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import { MockOptionsRepository } from '../../../utils/repositories';

const fragmentMocks = vi.hoisted(() => {
  const scheduleAutoSave = vi.fn();
  const getFragmentDefaults = vi.fn(() => ({
    useFootnoteFormat: true,
    captureContext: false,
    contextLength: 200,
    contextMode: 'chars' as const,
    selectionModifierEnabled: false,
    selectionModifierKeys: ['alt', 'shift'] as const,
    keyboardShortcutsEnabled: true
  }));
  return {
    scheduleAutoSave,
    getFragmentDefaults
  };
}) as {
  scheduleAutoSave: ReturnType<typeof vi.fn>;
  getFragmentDefaults: ReturnType<typeof vi.fn>;
};

vi.mock('@shared/config', async () => {
  const actual = await vi.importActual<typeof import('@shared/config')>('@shared/config');
  return {
    ...actual,
    configProvider: {
      ...actual.configProvider,
      getFragmentClipperDefaults: fragmentMocks.getFragmentDefaults
    }
  };
});

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({
    scheduleAutoSave: fragmentMocks.scheduleAutoSave
  }),
  markPendingAutoSave: vi.fn()
}));

const noopStateManager = {} as OptionsStateManager;

const getInput = (id: string): HTMLInputElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Expected input #${id}`);
  }
  return element;
};

const getSelect = (id: string): HTMLSelectElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Expected select #${id}`);
  }
  return element;
};

const getElement = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element #${id}`);
  }
  return element;
};

describe('FragmentSection', () => {
  let registry: FormSectionRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<section id="fragment-section"></section>';
    registry = new FormSectionRegistry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = (): { section: FragmentSection; repo: MockOptionsRepository } => {
    const container = getElement('fragment-section');
    const repo = new MockOptionsRepository();
    const section = new FragmentSection(container, repo);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return { section, repo };
  };

  it('toggles modifier keys visibility on change and exposes shortcut reveal helper', () => {
    const { section } = renderSection();
    const toggle = getInput('fragmentModifierToggle');
    const modifierGroup = getElement('fragmentModifierKeysGroup');
    expect(modifierGroup.style.display).toBe('none');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
    expect(section.highlightKeyboardShortcuts()).toBe(true);

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(modifierGroup.style.display).toBe('grid');
    expect(fragmentMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);

    section.destroy();
  });

  it('applies snapshot defaults and collects updated fragment settings', async () => {
    const { section } = renderSection();
    const captureCheckbox = getInput('fragmentCaptureContext');
    const contextLengthGroup = getElement('fragmentContextLengthGroup');
    const contextModeGroup = getElement('fragmentContextModeGroup');
    const contextLengthInput = getInput('fragmentContextLength');
    const contextModeSelect = getSelect('fragmentContextMode');
    expect(contextLengthGroup.style.display).toBe('none');
    expect(contextModeGroup.style.display).toBe('none');
    expect(contextLengthInput.disabled).toBe(true);
    expect(contextModeSelect.disabled).toBe(true);

    const options = {
      fragmentClipper: {
        useFootnoteFormat: false,
        captureContext: true,
        contextLength: 512,
        contextMode: 'sentences',
        selectionModifierEnabled: true,
        selectionModifierKeys: ['ctrl', 'shift'],
        keyboardShortcutsEnabled: false
      }
    } as StoredOptions;

    await registry.apply(options);

    const toggle = getInput('fragmentModifierToggle');
    const keyboardToggle = getInput('fragmentKeyboardShortcutsEnabled');
    expect(toggle.checked).toBe(true);
    expect(keyboardToggle.checked).toBe(false);
    expect(captureCheckbox.checked).toBe(true);
    expect(contextLengthGroup.style.display).toBe('grid');
    expect(contextModeGroup.style.display).toBe('grid');
    expect(contextLengthInput.disabled).toBe(false);
    expect(contextModeSelect.disabled).toBe(false);
    expect(contextLengthInput.value).toBe('512');
    expect(contextModeSelect.value).toBe('sentences');

    const modifierCheckboxes = Array.from(
      document.querySelectorAll<HTMLInputElement>('[data-fragment-modifier-key]')
    );
    const enabledKeys = modifierCheckboxes
      .filter((input) => input.checked)
      .map((input) => input.dataset.fragmentModifierKey);
    expect(enabledKeys).toEqual(['ctrl', 'shift']);

    const altCheckbox = modifierCheckboxes.find(
      (input) => input.dataset.fragmentModifierKey === 'alt'
    );
    expect(altCheckbox).toBeDefined();
    if (altCheckbox) {
      altCheckbox.checked = true;
      altCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect(fragmentMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);

    contextLengthInput.value = '0';
    contextLengthInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fragmentMocks.scheduleAutoSave).toHaveBeenCalledTimes(2);
    expect(contextLengthInput.value).toBe('200');

    const fragmentClipperOptions = options.fragmentClipper;
    if (!fragmentClipperOptions) {
      throw new Error('fragmentClipper options missing');
    }
    const previous = {
      fragmentClipper: {
        ...fragmentClipperOptions,
        contextLength: 256,
        contextMode: 'chars'
      }
    } as StoredOptions;

    const collected = registry.collect(previous);
    expect(collected.fragmentClipper).toBeDefined();
    expect(collected.fragmentClipper?.selectionModifierEnabled).toBe(true);
    expect(collected.fragmentClipper?.useFootnoteFormat).toBe(false);
    expect(collected.fragmentClipper?.captureContext).toBe(true);
    expect(collected.fragmentClipper?.selectionModifierKeys).toContain('alt');
    expect(collected.fragmentClipper?.contextLength).toBe(200);
    expect(collected.fragmentClipper?.contextMode).toBe('sentences');

    section.destroy();
  });

  it('toggles context controls visibility when capture context is disabled', () => {
    const { section } = renderSection();
    const captureCheckbox = getInput('fragmentCaptureContext');
    const contextLengthGroup = getElement('fragmentContextLengthGroup');
    const contextModeGroup = getElement('fragmentContextModeGroup');
    const contextLengthInput = getInput('fragmentContextLength');
    const contextModeSelect = getSelect('fragmentContextMode');

    const initialCalls = fragmentMocks.scheduleAutoSave.mock.calls.length;

    captureCheckbox.checked = true;
    captureCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(contextLengthGroup.style.display).toBe('grid');
    expect(contextModeGroup.style.display).toBe('grid');
    expect(contextLengthInput.disabled).toBe(false);
    expect(contextModeSelect.disabled).toBe(false);
    expect(fragmentMocks.scheduleAutoSave.mock.calls.length).toBeGreaterThanOrEqual(
      initialCalls + 1
    );

    captureCheckbox.checked = false;
    captureCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(contextLengthGroup.style.display).toBe('none');
    expect(contextModeGroup.style.display).toBe('none');
    expect(contextLengthInput.disabled).toBe(true);
    expect(contextModeSelect.disabled).toBe(true);
    expect(fragmentMocks.scheduleAutoSave.mock.calls.length).toBeGreaterThanOrEqual(
      initialCalls + 2
    );

    section.destroy();
  });

  it('reacts to repository updates from other contexts', async () => {
    const { section, repo } = renderSection();
    const update: Partial<FragmentClipperOptions> = {
      captureContext: true,
      contextLength: 512,
      contextMode: 'sentences',
      useFootnoteFormat: false,
      keyboardShortcutsEnabled: false,
      selectionModifierEnabled: true,
      selectionModifierKeys: ['alt', 'ctrl']
    };
    await repo.set({
      fragmentClipper: update
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      const captureCheckbox = document.getElementById('fragmentCaptureContext') as HTMLInputElement;
      expect(captureCheckbox.checked).toBe(true);
    });

    section.destroy();
  });

  it('normalizes context length input and schedules auto save on change', () => {
    const { section } = renderSection();
    const captureCheckbox = getInput('fragmentCaptureContext');
    captureCheckbox.checked = true;
    captureCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const contextLengthInput = getInput('fragmentContextLength');
    fragmentMocks.scheduleAutoSave.mockClear();

    contextLengthInput.value = '128';
    contextLengthInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(contextLengthInput.value).toBe('128');
    expect(fragmentMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);

    contextLengthInput.value = '-10';
    contextLengthInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(contextLengthInput.value).toBe('200');
    expect(fragmentMocks.scheduleAutoSave).toHaveBeenCalledTimes(2);

    section.destroy();
  });

  it('updates context mode selection and triggers auto save', () => {
    const { section } = renderSection();
    const captureCheckbox = document.getElementById('fragmentCaptureContext') as HTMLInputElement;
    captureCheckbox.checked = true;
    captureCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const contextModeSelect = document.getElementById('fragmentContextMode') as HTMLSelectElement;
    fragmentMocks.scheduleAutoSave.mockClear();

    contextModeSelect.value = 'sentences';
    contextModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fragmentMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);
    expect(contextModeSelect.value).toBe('sentences');

    section.destroy();
  });

  it('falls back to fragment defaults when snapshot is empty', async () => {
    const { section } = renderSection();
    await registry.apply({} as StoredOptions);

    expect(getInput('fragmentUseFootnote').checked).toBe(true);
    expect(getInput('fragmentCaptureContext').checked).toBe(false);
    expect(getInput('fragmentModifierToggle').checked).toBe(false);
    expect(getInput('fragmentKeyboardShortcutsEnabled').checked).toBe(true);
    expect(getInput('fragmentContextLength').value).toBe('200');
    expect(getSelect('fragmentContextMode').value).toBe('chars');

    section.destroy();
  });
});
