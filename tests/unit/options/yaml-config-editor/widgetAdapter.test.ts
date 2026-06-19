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

describe('YamlConfigEditorWidgetAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
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

  it('renders content-scoped values instead of a single article value in the all view', () => {
    const { container } = createMount({ yamlConfig: null });
    const typeRow = findYamlRow(container, 'type');

    expect(typeRow.querySelector('input[data-yaml-field="defaultValue"]')).toBeNull();
    const values = Array.from(
      typeRow.querySelectorAll<HTMLElement>('[data-yaml-field-values="defaultValue"] [data-mode]')
    ).map((item) => [
      item.dataset.mode,
      item.querySelector('.yaml-content-value-label')?.textContent,
      item.querySelector('.yaml-content-value-code')?.textContent
    ]);

    expect(values).toEqual([
      ['article', 'Article', 'article'],
      ['clipper', 'Clipper', 'clipper'],
      ['video', 'Video', 'video'],
      ['ai_chat', 'AI', 'ai_chat']
    ]);

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
