/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n/locales';
import type { CompleteOptions } from '@shared/types/options';
import { DEFAULT_OPTIONS } from '@shared/config';
import { VideoSettingsWidget } from '@options/widgets/VideoSettingsWidget';
import { ReadingSettingsWidget } from '@options/widgets/ReadingSettingsWidget';
import { FragmentSettingsWidget } from '@options/widgets/FragmentSettingsWidget';
import { TemplatesWidget } from '@options/widgets/TemplatesWidget';
import { DomainMappingsWidget } from '@options/widgets/DomainMappingsWidget';
import { RestStorageWidget } from '@options/widgets/RestStorageWidget';
import { VaultRouterWidget } from '@options/widgets/VaultRouterWidget';

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

  it('collects template settings with preview-style rows and token insertion', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const runtime = createRuntime();
    const widget = new TemplatesWidget();
    const options = buildOptions();
    options.templates = {
      article: 'Articles/{yyyy}/{slug}.md',
      fragment: 'Clips/{slug}.md',
      reading: 'Reading/{slug}.md',
      ai: 'AI/{title}.md'
    };

    widget.mount(container, { options, messages: DEFAULT_RUNTIME_MESSAGES }, runtime);

    expect(container.querySelectorAll('.schema-output-template-row')).toHaveLength(4);
    expect(container.querySelector('.schema-output-token-block')).toBeTruthy();
    expect(container.querySelectorAll('.schema-token')).toHaveLength(11);

    const articleInput = container.querySelector<HTMLInputElement>(
      'input.schema-output-template-input'
    );
    const readingMode = container.querySelector<HTMLSelectElement>(
      'select.schema-output-template-select'
    );
    const templateInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input.schema-output-template-input')
    );
    const readingCustom = templateInputs[2];
    const aiInput = templateInputs[3];
    const domainToken = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button.schema-token')
    ).find((button) => button.textContent === '{domain}');

    articleInput!.focus();
    articleInput!.setSelectionRange(articleInput!.value.length, articleInput!.value.length);
    domainToken?.click();
    expect(articleInput?.value).toBe('Articles/{yyyy}/{slug}.md{domain}');

    readingMode!.value = 'custom';
    readingMode!.dispatchEvent(new Event('change', { bubbles: true }));
    readingCustom.value = 'Reading/custom.md';
    readingCustom.dispatchEvent(new Event('input', { bubbles: true }));
    aiInput.value = 'AI/{platform}/{title}.md';
    aiInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(runtime.notifyDirty).toHaveBeenCalledWith(['templates']);
    expect(widget.collect().templates).toEqual({
      article: 'Articles/{yyyy}/{slug}.md{domain}',
      fragment: 'Clips/{slug}.md',
      reading: 'Reading/custom.md',
      ai: 'AI/{platform}/{title}.md'
    });

    container.remove();
  });

  it('keeps domain mapping add and remove semantics inside the production shell wrapper', () => {
    const container = document.createElement('div');
    const runtime = createRuntime();
    const widget = new DomainMappingsWidget();
    const options = buildOptions();
    options.domainMappings = { 'example.com': 'Example' };

    widget.mount(container, { options, messages: DEFAULT_RUNTIME_MESSAGES }, runtime);

    const addButton = container.querySelector<HTMLButtonElement>(
      'button.schema-output-widget-action'
    );
    expect(container.querySelector('h3')?.textContent).toBe(
      DEFAULT_RUNTIME_MESSAGES.domainMappingTitle
    );
    expect(addButton?.textContent).toContain(DEFAULT_RUNTIME_MESSAGES.addMappingButton);

    addButton?.click();
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.mapping-item'));
    expect(rows).toHaveLength(2);

    const newRow = rows[1];
    const domainInput = newRow.querySelector<HTMLInputElement>('.field-domain');
    const aliasInput = newRow.querySelector<HTMLInputElement>('.field-name');
    domainInput!.value = 'docs.example.com';
    domainInput!.dispatchEvent(new Event('input', { bubbles: true }));
    aliasInput!.value = 'Docs';
    aliasInput!.dispatchEvent(new Event('input', { bubbles: true }));

    rows[0].querySelector<HTMLButtonElement>('.action-delete')?.click();

    expect(runtime.notifyDirty).toHaveBeenCalledWith(['domainMappings']);
    expect(widget.collect().domainMappings).toEqual({
      'docs.example.com': 'Docs'
    });
  });

  it('wraps rest storage and routing widgets in preview-style table shells', () => {
    const container = document.createElement('div');
    const runtime = createRuntime();
    const options = buildOptions();
    options.vaultRouter = {
      defaultVaultId: 'default-vault',
      vaults: [
        {
          id: 'default-vault',
          vault: 'AllInObsidian',
          name: 'AllInObsidian',
          enabled: true,
          isDefault: true,
          httpsUrl: 'https://127.0.0.1:27124/',
          httpUrl: 'http://127.0.0.1:27123/',
          apiKey: 'secret',
          rules: [
            {
              id: 'rule-1',
              enabled: true,
              type: 'domain',
              pattern: 'example.com',
              vaultId: 'default-vault',
              priority: 10
            }
          ]
        }
      ]
    };

    const restWidget = new RestStorageWidget({
      optionsRepository: {
        getAllOptions: vi.fn(),
        saveOptions: vi.fn(),
        onChange: vi.fn(() => () => {})
      } as never
    });
    restWidget.mount(container, { options, messages: DEFAULT_RUNTIME_MESSAGES }, runtime);

    expect(container.querySelector('.schema-storage-rest-shell')).toBeTruthy();
    expect(container.querySelector('.schema-storage-table-host')).toBeTruthy();
    expect(container.querySelector('.schema-storage-actions')).toBeTruthy();
    expect(container.querySelector('.schema-widget-note')).toBeTruthy();

    restWidget.destroy();

    const routingContainer = document.createElement('div');
    const routingWidget = new VaultRouterWidget();
    routingWidget.mount(routingContainer, { options, messages: DEFAULT_RUNTIME_MESSAGES }, runtime);

    expect(routingContainer.querySelector('.schema-storage-routing-shell')).toBeTruthy();
    expect(routingContainer.querySelector('[data-role="vault-router-view"]')).toBeTruthy();
    expect(routingContainer.querySelector('[data-role="routing-controls"]')).toBeTruthy();
    expect(routingContainer.querySelector('.routing-rule-pattern')).toBeTruthy();

    const patternInput = routingContainer.querySelector<HTMLInputElement>('.routing-rule-pattern');
    patternInput!.value = 'news.example.com';
    patternInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(runtime.notifyDirty).toHaveBeenCalledWith(['vaultRouter']);
    expect(routingWidget.collect().vaultRouter?.vaults[0]?.rules?.[0]?.pattern).toBe(
      'news.example.com'
    );
  });
});
