/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { CompleteOptions } from '@shared/types/options';
import { YamlConfigWidget } from '@options/widgets/YamlConfigWidget';
import { ReadingSettingsWidget } from '@options/widgets/ReadingSettingsWidget';
import { FragmentSettingsWidget } from '@options/widgets/FragmentSettingsWidget';
import { VideoSettingsWidget } from '@options/widgets/VideoSettingsWidget';

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
    subtitleTranslation: { ...DEFAULT_OPTIONS.subtitleTranslation! },
    yamlConfig: {
      contentTypes: {
        article: {
          customFields: []
        }
      }
    }
  } as CompleteOptions;
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

function findYamlRow(container: HTMLElement, fieldName: string): HTMLElement {
  const input = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[data-yaml-field="name"]')
  ).find((candidate) => candidate.value === fieldName);
  const row = input?.closest<HTMLElement>('[data-row-id]');
  if (!row) {
    throw new Error(`Missing YAML row: ${fieldName}`);
  }
  return row;
}

function setInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function selectValue(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('native leaf option widgets', () => {
  it('keeps YAML on the native Stitch widget instead of the legacy YAML view', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/options/widgets/YamlConfigWidget.ts'),
      'utf8'
    );

    expect(source).not.toContain('YamlConfigView');
    expect(source).not.toContain('@ui/domains/yaml-config');
  });

  it('collects structured YAML edits', async () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    const options = buildOptions();
    options.yamlConfig = {
      contentTypes: {
        article: {
          fields: [{ name: 'author', type: 'text', enabled: false }]
        }
      }
    };
    widget.mount(container, { options });

    expect(container.querySelector('[data-role="yaml-config-view"]')).toBeFalsy();
    expect(container.querySelector('.stitch-yaml-config-table')).toBeTruthy();
    expect(container.querySelector('[class*="aobx-"]')).toBeFalsy();

    const fieldInput = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
      (input) => input.value === 'author'
    );
    const row = fieldInput?.closest<HTMLElement>('[data-row-id]');
    const checkbox = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(widget.collect().yamlConfig?.contentTypes?.article?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'author',
          enabled: true
        })
      ])
    );
  });

  it('adds native YAML custom fields and domain overrides with Stitch controls', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    widget.mount(container, { options: buildOptions() });

    const addField = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '+ Add field'
    );
    expect(addField).toBeTruthy();
    addField!.click();

    const customName = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[data-yaml-field="name"][data-custom="true"]'
      )
    ).find((input) => input.value === 'custom_field');
    expect(customName).toBeTruthy();
    customName!.value = 'review_status';
    customName!.dispatchEvent(new Event('input', { bubbles: true }));

    const customRow = customName!.closest<HTMLElement>('[data-row-id]');
    const articleToggle = customRow?.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-mode="article"]'
    );
    expect(articleToggle).toBeTruthy();
    articleToggle!.checked = true;
    articleToggle!.dispatchEvent(new Event('change', { bubbles: true }));

    const addRule = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '+ Add domain rule'
    );
    expect(addRule).toBeTruthy();
    addRule!.click();

    const domain = container.querySelector<HTMLInputElement>('input[data-yaml-domain="domain"]');
    expect(domain).toBeTruthy();
    domain!.value = 'example.com';
    domain!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(widget.collect().yamlConfig?.contentTypes?.article?.customFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'review_status',
          enabled: true,
          isCustom: true
        })
      ])
    );
    expect(widget.collect().yamlConfig?.contentTypes?.article?.domainOverrides).toEqual(
      expect.objectContaining({
        'example.com': expect.any(Array)
      })
    );
  });

  it('keeps YAML default values separate from value paths in the native table', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    const options = buildOptions();
    options.yamlConfig = {
      contentTypes: {
        article: {
          customFields: [
            { name: 'release_version', type: 'text', enabled: true, defaultValue: 'v1.0.0' },
            { name: 'source_title', type: 'text', enabled: true, valuePath: 'title' }
          ]
        }
      }
    };
    widget.mount(container, { options });

    const versionRow = findYamlRow(container, 'release_version');
    const versionDefault = versionRow.querySelector<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]'
    );
    const versionPath = versionRow.querySelector<HTMLInputElement>(
      'input[data-yaml-field="valuePath"]'
    );
    expect(versionDefault).toBeTruthy();
    expect(versionPath).toBeTruthy();
    setInput(versionDefault!, 'metadata.author');
    setInput(versionPath!, '');

    const titleRow = findYamlRow(container, 'source_title');
    const titleDefault = titleRow.querySelector<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]'
    );
    const titlePath = titleRow.querySelector<HTMLInputElement>(
      'input[data-yaml-field="valuePath"]'
    );
    expect(titleDefault).toBeTruthy();
    expect(titlePath).toBeTruthy();
    setInput(titleDefault!, '');
    setInput(titlePath!, 'title');

    const fields = widget.collect().yamlConfig?.contentTypes?.article?.customFields;
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'release_version', defaultValue: 'metadata.author' }),
        expect.objectContaining({ name: 'source_title', valuePath: 'title' })
      ])
    );
  });

  it('does not cross-pollute same-name default fields across YAML content types', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    widget.mount(container, { options: buildOptions() });

    const titleRow = findYamlRow(container, 'title');
    const titleToggle = titleRow.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-mode="article"]'
    );
    expect(titleToggle).toBeTruthy();
    titleToggle!.checked = false;
    titleToggle!.dispatchEvent(new Event('change', { bubbles: true }));

    const collected = widget.collect().yamlConfig?.contentTypes;
    expect(collected?.article?.fields).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ name: 'type', defaultValue: 'ai_chat' })
      ])
    );
    expect(collected?.clipper?.fields).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ name: 'type', defaultValue: 'ai_chat' })
      ])
    );
    expect(collected?.video?.fields).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ name: 'type', defaultValue: 'ai_chat' })
      ])
    );
  });

  it('renders and collects default YAML custom fields such as article status', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    widget.mount(container, { options: buildOptions() });

    const statusRow = findYamlRow(container, 'status');
    expect(statusRow).toBeTruthy();
    const defaultValue = statusRow.querySelector<HTMLInputElement>(
      'input[data-yaml-field="defaultValue"]'
    );
    expect(defaultValue?.value).toBe('unread');

    expect(widget.collect().yamlConfig?.contentTypes?.article?.customFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'status',
          enabled: true,
          defaultValue: ['unread'],
          isCustom: true
        })
      ])
    );
  });

  it('blocks invalid YAML table edits and keeps the last valid config visible for collection', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    const options = buildOptions();
    options.yamlConfig = {
      contentTypes: {
        article: {
          customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 42 }]
        }
      }
    };
    widget.mount(container, { options });

    const scoreRow = findYamlRow(container, 'score');
    setInput(
      scoreRow.querySelector<HTMLInputElement>('input[data-yaml-field="defaultValue"]')!,
      'not-a-number'
    );
    setInput(
      scoreRow.querySelector<HTMLInputElement>('input[data-yaml-field="valuePath"]')!,
      'meta author'
    );

    const collected = widget.collect().yamlConfig?.contentTypes?.article?.customFields;
    expect(collected).toEqual([expect.objectContaining({ name: 'score', defaultValue: 42 })]);
    expect(container.textContent).toContain('Please fix YAML configuration errors before saving.');

    setInput(
      scoreRow.querySelector<HTMLInputElement>('input[data-yaml-field="defaultValue"]')!,
      '7'
    );
    setInput(
      scoreRow.querySelector<HTMLInputElement>('input[data-yaml-field="valuePath"]')!,
      'meta.author'
    );

    expect(widget.collect().yamlConfig?.contentTypes?.article?.customFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'score', defaultValue: 7, valuePath: 'meta.author' })
      ])
    );
  });

  it('validates YAML defaults per content type so later edits cannot mask invalid values', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    const options = buildOptions();
    options.yamlConfig = {
      contentTypes: {
        article: {
          customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 11 }]
        },
        clipper: {
          customFields: [{ name: 'score', type: 'number', enabled: true, defaultValue: 2 }]
        }
      }
    };
    widget.mount(container, { options });

    findButton(container, 'Article').click();
    const articleScore = findYamlRow(container, 'score');
    setInput(
      articleScore.querySelector<HTMLInputElement>('input[data-yaml-field="defaultValue"]')!,
      'not-a-number'
    );

    findButton(container, 'Clipper').click();
    const clipperScore = findYamlRow(container, 'score');
    setInput(
      clipperScore.querySelector<HTMLInputElement>('input[data-yaml-field="defaultValue"]')!,
      '3'
    );

    const collected = widget.collect().yamlConfig;
    expect(collected?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({ name: 'score', defaultValue: 11 })
    ]);
    expect(collected?.contentTypes?.clipper?.customFields).toEqual([
      expect.objectContaining({ name: 'score', defaultValue: 2 })
    ]);
    expect(container.textContent).toContain('Please fix YAML configuration errors before saving.');
    expect(container.textContent).toContain('Default value does not match the field type.');
  });

  it('edits and validates native YAML domain override default values and value paths', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    const options = buildOptions();
    options.yamlConfig = {
      contentTypes: {
        article: {
          domainOverrides: {
            'example.com': [{ name: 'author', type: 'text', enabled: true, defaultValue: 'Guest' }]
          }
        }
      }
    };
    widget.mount(container, { options });

    const card = container.querySelector<HTMLElement>('.stitch-yaml-domain-rule');
    expect(card).toBeTruthy();
    const fieldRow = card!.querySelector<HTMLElement>('.yaml-domain-field-row');
    expect(fieldRow).toBeTruthy();
    const defaultInput = fieldRow!.querySelector<HTMLInputElement>(
      'input[data-yaml-domain-field="defaultValue"]'
    );
    const valuePathInput = fieldRow!.querySelector<HTMLInputElement>(
      'input[data-yaml-domain-field="valuePath"]'
    );
    expect(defaultInput).toBeTruthy();
    expect(valuePathInput).toBeTruthy();
    setInput(defaultInput!, 'Guest.Author');
    setInput(valuePathInput!, 'meta.author');

    expect(widget.collect().yamlConfig?.contentTypes?.article?.domainOverrides).toEqual({
      'example.com': [
        expect.objectContaining({
          name: 'author',
          defaultValue: 'Guest.Author',
          valuePath: 'meta.author'
        })
      ]
    });
  });

  it('keeps domain fields on content type changes and blocks invalid domain override state', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    const options = buildOptions();
    options.yamlConfig = {
      contentTypes: {
        article: {
          domainOverrides: {
            'example.com': [
              {
                name: 'author',
                type: 'text',
                enabled: true,
                defaultValue: 'Guest',
                valuePath: 'meta.author'
              },
              { name: 'author', type: 'text', enabled: true }
            ],
            ' Example.COM ': [{ name: 'title', type: 'text', enabled: true }]
          }
        }
      }
    };
    widget.mount(container, { options });

    widget.collect();
    expect(container.textContent).toContain('Duplicate domain for this content type.');

    const firstCard = container.querySelector<HTMLElement>('.stitch-yaml-domain-rule');
    expect(firstCard).toBeTruthy();
    const contentType = firstCard!.querySelector<HTMLSelectElement>('.yaml-rule-meta select')!;
    selectValue(contentType, 'video');

    expect(firstCard!.textContent).toContain('Current content type does not support field: author');
    expect(
      widget.collect().yamlConfig?.contentTypes?.article?.domainOverrides?.['example.com']
    ).toEqual([
      expect.objectContaining({ name: 'author', defaultValue: 'Guest', valuePath: 'meta.author' }),
      expect.objectContaining({ name: 'author' })
    ]);

    expect(container.textContent).toContain('Duplicate field in this domain rule.');

    const deleteButtons = Array.from(
      firstCard!.querySelectorAll<HTMLButtonElement>('button')
    ).filter((button) => button.textContent?.trim() === 'Delete');
    deleteButtons.at(-1)?.click();
    deleteButtons.at(-2)?.click();

    expect(container.textContent).toContain('Add at least one field.');
  });

  it('does not report a saveable draft to the runtime while YAML is invalid', () => {
    const container = document.createElement('div');
    const widget = new YamlConfigWidget();
    const runtime = { notifyDirty: vi.fn() };
    const options = buildOptions();
    options.yamlConfig = {
      contentTypes: {
        article: {
          customFields: [{ name: 'published', type: 'boolean', enabled: true, defaultValue: true }]
        }
      }
    };
    widget.mount(container, { options }, runtime);

    const row = findYamlRow(container, 'published');
    setInput(
      row.querySelector<HTMLInputElement>('input[data-yaml-field="defaultValue"]')!,
      'sometimes'
    );

    expect(widget.collect().yamlConfig?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({ name: 'published', defaultValue: true })
    ]);
    expect(runtime.notifyDirty).toHaveBeenCalledWith(['yamlConfig'], { invalid: true });
  });

  it('keeps existing reading settings widget collect/apply behavior', () => {
    const container = document.createElement('div');
    const widget = new ReadingSettingsWidget();
    widget.mount(container, { options: buildOptions() });

    const select = container.querySelector('select')!;
    select.value = 'full';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(widget.collect().readingSession).toEqual(
      expect.objectContaining({
        exportMode: 'full'
      })
    );
  });

  it('collects fragment settings edits', () => {
    const container = document.createElement('div');
    const widget = new FragmentSettingsWidget();
    widget.mount(container, { options: buildOptions() });

    const input = container.querySelector<HTMLInputElement>('input')!;
    input.value = '360';

    expect(widget.collect().fragmentClipper).toEqual(
      expect.objectContaining({
        contextLength: 360
      })
    );
  });

  it('collects video settings edits', () => {
    const container = document.createElement('div');
    const widget = new VideoSettingsWidget();
    widget.mount(container, { options: buildOptions() });

    const [labelInput, shortcutInput] = Array.from(
      container.querySelectorAll<HTMLInputElement>('input')
    );
    labelInput.value = 'Clip video';
    shortcutInput.value = 'Alt+Shift+V';

    expect(widget.collect().video).toEqual(
      expect.objectContaining({
        promptButtonLabel: 'Clip video',
        promptShortcut: 'Alt+Shift+V'
      })
    );
  });
});
