/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductionStitchWidgetHost } from '@options/app/productionStitchWidgetHost';
import { YamlConfigEditorWidgetAdapter } from '@options/yaml-config-editor/widgetAdapter';
import { mergeOptions } from '@shared/config/optionsMerger';
import en from '@i18n/locales/en';
import type { CompleteOptions } from '@shared/types/options';

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
    { options: mergeOptions(initialOptions) as CompleteOptions },
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
    const scoreRow = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]')).find(
      (row) =>
        Array.from(row.querySelectorAll<HTMLInputElement>('input')).some(
          (input) => input.value === 'score'
        )
    );
    const defaultValue = scoreRow?.querySelector<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]'
    );

    expect(defaultValue).toBeTruthy();
    defaultValue!.value = 'not-a-number';
    defaultValue!.dispatchEvent(new Event('input', { bubbles: true }));

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
        options: mergeOptions({
          yamlConfig: {
            contentTypes: {
              article: {
                customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
              }
            }
          }
        }) as CompleteOptions,
        messages: {
          ...en.runtime,
          yamlFieldArticleLabel: 'Artikel test',
          yamlFieldAddButton: '+ Feld test',
          yamlFieldSaveBlockedWarning: 'YAML test block'
        }
      },
      { notifyDirty: vi.fn(), reportError: vi.fn() }
    );

    expect(container.textContent).toContain('Artikel test');
    expect(container.textContent).toContain('+ Feld test');

    const scoreRow = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]')).find(
      (row) =>
        Array.from(row.querySelectorAll<HTMLInputElement>('input')).some(
          (input) => input.value === 'score'
        )
    );
    const defaultValue = scoreRow?.querySelector<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]'
    );
    expect(defaultValue).toBeTruthy();
    defaultValue!.value = 'not-a-number';
    defaultValue!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(container.textContent).toContain('YAML test block');
    expect(container.textContent).not.toContain(
      'Please fix YAML configuration errors before saving.'
    );
  });

  it('locks non-owner content toggles for default custom fields in the all view', () => {
    const { adapter, container, notifyDirty } = createMount({ yamlConfig: null });
    const statusRow = findYamlRow(container, 'status');

    const articleToggle = statusRow.querySelector<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="article"]'
    );
    const clipperToggle = statusRow.querySelector<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="clipper"]'
    );
    const videoToggle = statusRow.querySelector<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="video"]'
    );
    const aiToggle = statusRow.querySelector<HTMLInputElement>(
      'input.stitch-yaml-toggle[data-mode="ai_chat"]'
    );

    expect(articleToggle?.disabled).toBe(false);
    expect(articleToggle?.checked).toBe(true);
    for (const toggle of [clipperToggle, videoToggle, aiToggle]) {
      expect(toggle?.disabled).toBe(true);
      toggle!.checked = true;
      toggle!.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const draft = adapter.collect().yamlConfig;
    expect(draft ?? null).toBeNull();
    expect(notifyDirty).not.toHaveBeenCalledWith(['yamlConfig'], { invalid: false });
  });

  it('is the production yaml-config widget factory result', () => {
    const draft = mergeOptions(null) as CompleteOptions;
    const host = createProductionStitchWidgetHost({
      getDraft: () => draft,
      getState: () => ({ previewTheme: 'light' }) as never,
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
