/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n/locales';
import type { CompleteOptions } from '@shared/types/options';
import { DEFAULT_OPTIONS } from '@shared/config';
import { VideoSettingsWidget } from '@options/widgets/VideoSettingsWidget';
import { ReadingSettingsWidget } from '@options/widgets/ReadingSettingsWidget';
import { FragmentSettingsWidget } from '@options/widgets/FragmentSettingsWidget';

function buildOptions(): CompleteOptions {
  return {
    ...DEFAULT_OPTIONS,
    rest: { ...DEFAULT_OPTIONS.rest },
    templates: { ...DEFAULT_OPTIONS.templates },
    domainMappings: { ...DEFAULT_OPTIONS.domainMappings },
    aiChat: { ...DEFAULT_OPTIONS.aiChat! },
    deepResearch: { ...DEFAULT_OPTIONS.deepResearch! },
    fragmentClipper: { ...DEFAULT_OPTIONS.fragmentClipper! },
    readingSession: { ...DEFAULT_OPTIONS.readingSession! },
    video: { ...DEFAULT_OPTIONS.video! },
    classifier: { ...DEFAULT_OPTIONS.classifier! },
    experimentalAi: { ...DEFAULT_OPTIONS.experimentalAi! },
    pageSummary: { ...DEFAULT_OPTIONS.pageSummary! },
    readingOverlaySummary: { ...DEFAULT_OPTIONS.readingOverlaySummary! },
    subtitleTranslation: { ...DEFAULT_OPTIONS.subtitleTranslation! }
  } as CompleteOptions;
}

function createRuntime() {
  return {
    notifyDirty: vi.fn(),
    reportError: vi.fn()
  };
}

describe('native schema leaf widgets', () => {
  it('collects video settings and reports dirty changes', () => {
    const container = document.createElement('div');
    const runtime = createRuntime();
    const widget = new VideoSettingsWidget();
    const options = buildOptions();
    options.video = {
      floatingPromptEnabled: false,
      promptButtonLabel: 'Start notes',
      promptShortcut: 'Alt+V'
    };

    widget.mount(container, { options, messages: DEFAULT_RUNTIME_MESSAGES }, runtime);

    const [toggle] = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    const [labelInput, shortcutInput] = Array.from(
      container.querySelectorAll<HTMLInputElement>('input.schema-input')
    );
    expect(container.querySelectorAll('.schema-mini-card')).toHaveLength(2);
    expect(toggle.checked).toBe(false);
    expect(labelInput.value).toBe('Start notes');

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    labelInput.value = 'Clip this video';
    labelInput.dispatchEvent(new Event('input', { bubbles: true }));
    shortcutInput.value = 'cmd+shift+v';
    shortcutInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(runtime.notifyDirty).toHaveBeenCalledWith(['video']);
    expect(widget.collect().video).toEqual({
      floatingPromptEnabled: true,
      promptButtonLabel: 'Clip this video',
      promptShortcut: 'CMD+SHIFT+V'
    });

    widget.update({
      options: {
        ...options,
        video: {
          floatingPromptEnabled: false,
          promptButtonLabel: 'Updated',
          promptShortcut: 'Alt+U'
        }
      },
      messages: DEFAULT_RUNTIME_MESSAGES
    });
    expect(widget.collect().video?.promptButtonLabel).toBe('Clip this video');

    widget.destroy();
    expect(container.childElementCount).toBe(0);
  });

  it('collects reading mode and highlight theme changes', () => {
    const container = document.createElement('div');
    const runtime = createRuntime();
    const widget = new ReadingSettingsWidget();
    const options = buildOptions();
    options.readingSession = {
      exportMode: 'full',
      highlightTheme: 'neonGreen'
    };

    widget.mount(container, { options, messages: DEFAULT_RUNTIME_MESSAGES }, runtime);

    const select = container.querySelector<HTMLSelectElement>('select.schema-select');
    expect(select?.value).toBe('full');
    expect(widget.collect().readingSession).toEqual({
      exportMode: 'full',
      highlightTheme: 'neonGreen'
    });

    select!.value = 'highlights';
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    const purple = container.querySelector<HTMLButtonElement>('[data-theme="purple"]');
    purple?.click();

    expect(runtime.notifyDirty).toHaveBeenCalledWith(['readingSession']);
    expect(widget.collect().readingSession).toEqual({
      exportMode: 'highlights',
      highlightTheme: 'purple'
    });

    widget.update({
      options: {
        ...options,
        readingSession: {
          exportMode: 'full',
          highlightTheme: 'neonOrange'
        }
      },
      messages: DEFAULT_RUNTIME_MESSAGES
    });
    expect(widget.collect().readingSession?.highlightTheme).toBe('purple');

    widget.destroy();
    expect(container.childElementCount).toBe(0);
  });

  it('collects fragment controls, visibility, and shortcut highlight lifecycle', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const runtime = createRuntime();
    const widget = new FragmentSettingsWidget();
    const options = buildOptions();
    options.fragmentClipper = {
      useFootnoteFormat: false,
      captureContext: false,
      contextLength: 120,
      contextMode: 'sentences',
      selectionModifierEnabled: false,
      selectionModifierKeys: ['alt'],
      keyboardShortcutsEnabled: true
    };

    widget.mount(container, { options, messages: DEFAULT_RUNTIME_MESSAGES }, runtime);

    const switches = Array.from(
      container.querySelectorAll<HTMLInputElement>('input.schema-switch-input')
    );
    const captureContext = switches[1];
    const modifierToggle = switches[2];
    const keyboardShortcuts = switches[3];
    const contextLength = container.querySelector<HTMLInputElement>('input[type="number"]');
    const contextMode = container.querySelector<HTMLSelectElement>('select.schema-select');
    const modifierKeys = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[data-fragment-modifier-key]')
    );

    expect(contextLength?.disabled).toBe(true);
    expect(contextMode?.disabled).toBe(true);
    expect(modifierKeys).toHaveLength(4);

    captureContext.checked = true;
    captureContext.dispatchEvent(new Event('change', { bubbles: true }));
    modifierToggle.checked = true;
    modifierToggle.dispatchEvent(new Event('change', { bubbles: true }));
    modifierKeys.find((item) => item.dataset.fragmentModifierKey === 'meta')!.click();
    contextLength!.value = '240';
    contextLength!.dispatchEvent(new Event('change', { bubbles: true }));
    contextMode!.value = 'chars';
    contextMode!.dispatchEvent(new Event('change', { bubbles: true }));
    keyboardShortcuts.checked = false;
    keyboardShortcuts.dispatchEvent(new Event('change', { bubbles: true }));

    expect(contextLength?.disabled).toBe(false);
    expect(
      modifierKeys
        .find((item) => item.dataset.fragmentModifierKey === 'meta')
        ?.classList.contains('is-active')
    ).toBe(true);
    expect(runtime.notifyDirty).toHaveBeenCalledWith(['fragmentClipper']);
    expect(widget.collect().fragmentClipper).toEqual({
      useFootnoteFormat: false,
      captureContext: true,
      contextLength: 240,
      contextMode: 'chars',
      selectionModifierEnabled: true,
      selectionModifierKeys: ['alt', 'meta'],
      keyboardShortcutsEnabled: false
    });

    expect(widget.highlightKeyboardShortcuts()).toBe(true);
    expect(container.querySelector('.schema-widget-highlight')).toBeTruthy();

    widget.destroy();
    expect(container.childElementCount).toBe(0);
    vi.useRealTimers();
  });
});
