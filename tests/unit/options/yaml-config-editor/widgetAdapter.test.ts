/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import {
  createInitialStitchState,
  createProductionContent
} from '@options/app/productionStitchStateMapper';
import { createProductionStitchWidgetHost } from '@options/app/productionStitchWidgetHost';
import { previewContent } from '@options/stitch/content';
import { YamlConfigEditorWidgetAdapter } from '@options/yaml-config-editor/widgetAdapter';
import type { CompleteOptions } from '@shared/types/options';
import { createCompleteOptions, queryRequired } from '../productionStitchShell.helpers';

function createMount(
  initialOptions: Partial<CompleteOptions> = {
    yamlConfig: {
      contentTypes: {
        article: {
          customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
        }
      }
    }
  }
) {
  const container = document.createElement('div');
  const adapter = new YamlConfigEditorWidgetAdapter();
  const notifyDirty = vi.fn();

  adapter.mount(
    container,
    { options: createCompleteOptions(initialOptions) },
    {
      notifyDirty,
      reportError: vi.fn()
    }
  );

  return { adapter, container, notifyDirty };
}

function findYamlRow(container: HTMLElement, fieldName: string): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]')).find((row) =>
    Array.from(row.querySelectorAll<HTMLInputElement>('input')).some(
      (input) => input.value === fieldName
    )
  );
  if (!row) {
    throw new Error(`Missing YAML row ${fieldName}`);
  }
  return row;
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.includes(label)
  );
  if (!button) {
    throw new Error(`Missing button ${label}`);
  }
  return button;
}

function findBlankEditableYamlRow(container: HTMLElement): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]')).find((row) => {
    const name = row.querySelector<HTMLInputElement>('input[data-yaml-field="name"]');
    return name && !name.disabled && name.value === '';
  });
  if (!row) {
    throw new Error('Missing blank editable YAML row');
  }
  return row;
}

let scrollIntoViewSpy = vi.fn();

function scrollIntoViewMock() {
  return scrollIntoViewSpy;
}

describe('YamlConfigEditorWidgetAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    scrollIntoViewSpy = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy
    });
  });

  it('mounts synchronously with stable Stitch YAML selectors and collect() returns yamlConfig', () => {
    const { adapter, container } = createMount();

    expect(container.querySelector('[data-stitch-widget="yaml-config"]')).toBeTruthy();
    expect(container.querySelector('.stitch-yaml-config-table')).toBeTruthy();
    expect(container.querySelector('[data-role="yaml-config-view"]')).toBeFalsy();
    expect(adapter.collect().yamlConfig?.contentTypes?.article?.customFields).toEqual(
      expect.arrayContaining([
        { name: 'score', type: 'number', enabled: true, defaultValue: 42, isCustom: true }
      ])
    );
  });

  it('keeps the last valid yamlConfig when invalid edits notify dirty metadata', () => {
    const { adapter, container, notifyDirty } = createMount();
    const scoreRow = findYamlRow(container, 'score');
    const defaultValue = queryRequired<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]',
      scoreRow
    );

    defaultValue.value = 'not-a-number';
    defaultValue.dispatchEvent(new Event('input', { bubbles: true }));

    expect(notifyDirty).toHaveBeenLastCalledWith(['yamlConfig'], { invalid: true });
    expect(() => adapter.collect()).not.toThrow();
    expect(adapter.collect()).toEqual({
      yamlConfig: {
        contentTypes: {
          article: {
            customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
          }
        }
      }
    });
    expect(container.textContent).toContain('Please fix YAML configuration errors before saving.');
  });

  it('renders user-visible YAML labels from injected messages', () => {
    const container = document.createElement('div');
    const adapter = new YamlConfigEditorWidgetAdapter();
    adapter.mount(
      container,
      {
        options: createCompleteOptions({
          yamlConfig: {
            contentTypes: {
              article: {
                customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
              }
            }
          }
        }),
        messages: {
          ...DEFAULT_RUNTIME_MESSAGES,
          yamlFieldArticleLabel: 'Artikel test',
          yamlFieldAddButton: '+ Feld test',
          yamlFieldSaveBlockedWarning: 'YAML test block'
        }
      },
      { notifyDirty: vi.fn(), reportError: vi.fn() }
    );

    expect(container.textContent).toContain('Artikel test');
    expect(container.textContent).toContain('+ Feld test');

    const scoreRow = findYamlRow(container, 'score');
    const defaultValue = queryRequired<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]',
      scoreRow
    );
    defaultValue.value = 'not-a-number';
    defaultValue.dispatchEvent(new Event('input', { bubbles: true }));

    expect(container.textContent).toContain('YAML test block');
    expect(container.textContent).not.toContain(
      'Please fix YAML configuration errors before saving.'
    );
  });

  it('renders YAML preview from the live editor state and active filter', () => {
    const { container } = createMount({
      yamlConfig: {
        contentTypes: {
          video: {
            fields: [{ name: 'url', type: 'text', enabled: false }],
            customFields: [{ name: 'sponsor', type: 'text', enabled: true, defaultValue: 'OpenAI' }]
          }
        }
      }
    });

    const preview = () =>
      queryRequired<HTMLElement>('[data-yaml-preview="content"]', container).textContent ?? '';

    expect(preview()).toContain('# Article');
    expect(preview()).toContain('# Video');
    expect(preview()).not.toContain('Research Article Example');

    queryRequired<HTMLButtonElement>('.yaml-filter[data-value="video"]', container).click();

    expect(preview()).toContain('# Video');
    expect(preview()).toContain('type: "video"');
    expect(preview()).toContain('platform: "YouTube"');
    expect(preview()).toContain('sponsor: "OpenAI"');
    expect(preview()).not.toContain('url:');
  });

  it('updates YAML preview when a field is edited', () => {
    const { container } = createMount();
    const scoreRow = findYamlRow(container, 'score');
    const defaultValue = queryRequired<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]',
      scoreRow
    );
    const preview = queryRequired<HTMLElement>('[data-yaml-preview="content"]', container);

    expect(preview.textContent).toContain('score: 42');

    defaultValue.value = '64';
    defaultValue.dispatchEvent(new Event('input', { bubbles: true }));

    expect(preview.textContent).toContain('score: 64');
  });

  it('leaves divergent built-in default values blank in the all view', () => {
    const { container } = createMount({ yamlConfig: null });
    const typeRow = findYamlRow(container, 'type');

    expect(typeRow.querySelector('[data-yaml-field-values="defaultValue"]')).toBeNull();
    expect(
      queryRequired<HTMLInputElement>('input[data-yaml-field="defaultValue"]', typeRow).value
    ).toBe('');

    queryRequired<HTMLButtonElement>('.yaml-filter[data-value="video"]', container).click();
    const videoTypeRow = findYamlRow(container, 'type');
    expect(
      queryRequired<HTMLInputElement>('input[data-yaml-field="defaultValue"]', videoTypeRow).value
    ).toBe('video');
  });

  it('locks non-owner content toggles for default custom fields in the all view', () => {
    const { adapter, container, notifyDirty } = createMount({ yamlConfig: null });
    const statusRow = findYamlRow(container, 'status');

    const articleToggle = queryRequired<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="article"]',
      statusRow
    );
    const clipperToggle = queryRequired<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="clipper"]',
      statusRow
    );
    const videoToggle = queryRequired<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="video"]',
      statusRow
    );
    const aiToggle = queryRequired<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="ai_chat"]',
      statusRow
    );

    expect(articleToggle.disabled).toBe(false);
    expect(articleToggle.checked).toBe(true);
    for (const toggle of [clipperToggle, videoToggle, aiToggle]) {
      expect(toggle.disabled).toBe(true);
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const draft = adapter.collect().yamlConfig;
    expect(draft ?? null).toBeNull();
    expect(notifyDirty).not.toHaveBeenCalledWith(['yamlConfig'], { invalid: false });
  });

  it('renders domain override fields as an aligned table', () => {
    const { container } = createMount({ yamlConfig: null });
    const addDomainRule = findButton(container, 'Add domain rule');

    addDomainRule.click();

    const domainRule = queryRequired<HTMLElement>('[data-domain-rule-id]', container);
    const fieldsTable = queryRequired<HTMLTableElement>(
      '.yaml-domain-fields-shell table',
      domainRule
    );
    const fieldRow = queryRequired<HTMLTableRowElement>('[data-domain-field-id]', fieldsTable);

    expect(fieldRow.tagName).toBe('TR');
    expect(fieldRow.classList.contains('schema-row')).toBe(false);
    expect(fieldsTable.querySelectorAll('thead th')).toHaveLength(5);
    expect(fieldRow.querySelectorAll(':scope > td')).toHaveLength(5);
    expect(queryRequired<HTMLInputElement>('[data-yaml-domain-field="enabled"]', fieldRow)).toBe(
      fieldRow.querySelector('td:first-child input')
    );
  });

  it('adds blank YAML fields and scrolls the table to the new row', () => {
    const { container } = createMount({ yamlConfig: null });

    findButton(container, 'Add field').click();

    const blankRow = findBlankEditableYamlRow(container);
    const name = queryRequired<HTMLInputElement>('input[data-yaml-field="name"]', blankRow);

    expect(name.value).toBe('');
    expect(scrollIntoViewMock()).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest'
    });
    expect(scrollIntoViewMock().mock.contexts.at(-1)).toBe(blankRow);
  });

  it('preserves the YAML field table scroll position when a field action re-renders', () => {
    const { container } = createMount();
    const shell = queryRequired<HTMLElement>('.stitch-yaml-config-table', container);
    shell.scrollTop = 137;
    shell.scrollLeft = 29;

    const scoreRow = findYamlRow(container, 'score');
    queryRequired<HTMLButtonElement>('.yaml-delete-button', scoreRow).click();

    const rerenderedShell = queryRequired<HTMLElement>('.stitch-yaml-config-table', container);
    expect(rerenderedShell.scrollTop).toBe(137);
    expect(rerenderedShell.scrollLeft).toBe(29);
  });

  it('adds blank domain override fields and scrolls the domain table to the new row', () => {
    const { container } = createMount({ yamlConfig: null });
    findButton(container, 'Add domain rule').click();

    const domainRule = queryRequired<HTMLElement>('[data-domain-rule-id]', container);
    const firstSelect = queryRequired<HTMLSelectElement>(
      'select[data-yaml-domain-field="name"]',
      domainRule
    );
    firstSelect.value = 'title';
    firstSelect.dispatchEvent(new Event('change', { bubbles: true }));
    scrollIntoViewMock().mockClear();

    findButton(domainRule, 'Add field').click();

    const rerenderedDomainRule = queryRequired<HTMLElement>('[data-domain-rule-id]', container);
    const blankRow = Array.from(
      rerenderedDomainRule.querySelectorAll<HTMLTableRowElement>('[data-domain-field-id]')
    ).find(
      (row) =>
        row.querySelector<HTMLSelectElement>('select[data-yaml-domain-field="name"]')?.value === ''
    );
    if (!blankRow) {
      throw new Error('Missing blank domain field row');
    }

    expect(scrollIntoViewMock()).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest'
    });
    expect(scrollIntoViewMock().mock.contexts.at(-1)).toBe(blankRow);
  });

  it('preserves the domain field table scroll position when a field action re-renders', () => {
    const { container } = createMount({
      yamlConfig: {
        contentTypes: {
          article: {
            domainOverrides: {
              'example.com': [
                { name: 'title', type: 'text', enabled: true },
                { name: 'author', type: 'text', enabled: true }
              ]
            }
          }
        }
      }
    });
    const shell = queryRequired<HTMLElement>('.yaml-domain-fields-shell', container);
    shell.scrollTop = 94;
    shell.scrollLeft = 18;

    queryRequired<HTMLButtonElement>('[data-domain-field-id] .yaml-delete-button', shell).click();

    const rerenderedShell = queryRequired<HTMLElement>('.yaml-domain-fields-shell', container);
    expect(rerenderedShell.scrollTop).toBe(94);
    expect(rerenderedShell.scrollLeft).toBe(18);
  });

  it('is the production yaml-config widget factory result', () => {
    const draft = createCompleteOptions(null);
    const state = createInitialStitchState(createProductionContent(previewContent, draft));
    const host = createProductionStitchWidgetHost({
      getDraft: () => draft,
      getState: () => state,
      getMessages: () => null,
      ensureVaultRouter: vi.fn(),
      mergePartialIntoDraft: vi.fn(),
      syncDefaultVaultFromRest: vi.fn(),
      refreshAppData: vi.fn(),
      scheduleDraftSave: vi.fn()
    });

    const widget = host.createWidgetFactory('yaml-config')?.();

    expect(widget).toBeInstanceOf(YamlConfigEditorWidgetAdapter);
  });
});
