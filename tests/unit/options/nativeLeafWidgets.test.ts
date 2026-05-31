/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductionStitchWidgetHost } from '@options/app/productionStitchWidgetHost';
import { YamlConfigEditorWidgetAdapter } from '@options/yaml-config-editor/widgetAdapter';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';

describe('native leaf option widget retirement coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the yaml-config widget type mounted through the editor adapter', () => {
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

  it('keeps invalid editor input out of saveable yamlConfig collection', () => {
    const container = document.createElement('div');
    const adapter = new YamlConfigEditorWidgetAdapter();
    const notifyDirty = vi.fn();

    adapter.mount(
      container,
      {
        options: mergeOptions({
          yamlConfig: {
            contentTypes: {
              article: {
                customFields: [
                  { name: 'published', type: 'boolean', enabled: true, defaultValue: true }
                ]
              }
            }
          }
        }) as CompleteOptions,
        messages: null
      },
      { notifyDirty, reportError: vi.fn() }
    );

    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]')).find((item) =>
      Array.from(item.querySelectorAll<HTMLInputElement>('input')).some(
        (input) => input.value === 'published'
      )
    );
    const defaultValue = row?.querySelector<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]'
    );
    expect(defaultValue).toBeTruthy();

    defaultValue!.value = 'sometimes';
    defaultValue!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(notifyDirty).toHaveBeenCalledWith(['yamlConfig'], { invalid: true });
    expect(adapter.collect().yamlConfig?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({ name: 'published', defaultValue: true })
    ]);
  });
});
