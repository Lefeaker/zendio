/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import { TemplatesWidget } from '@options/widgets/TemplatesWidget';
import type { CompleteOptions } from '@shared/types/options';

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

describe('TemplatesWidget', () => {
  it('collects edited template values from the real widget', () => {
    const container = document.createElement('div');
    const widget = new TemplatesWidget();
    widget.mount(container, { options: buildOptions() });

    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
    const select = container.querySelector('select') as HTMLSelectElement;

    const [articleInput, fragmentInput, readingCustomInput, aiInput] = inputs;

    articleInput.value = 'Articles/custom-article.md';
    articleInput.dispatchEvent(new Event('input', { bubbles: true }));

    fragmentInput.value = 'Fragments/custom-fragment.md';
    fragmentInput.dispatchEvent(new Event('input', { bubbles: true }));

    select.value = 'custom';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    readingCustomInput.value = 'Reading/custom-reading.md';
    readingCustomInput.dispatchEvent(new Event('input', { bubbles: true }));

    aiInput.value = 'AI/custom-ai.md';
    aiInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(widget.collect()).toEqual({
      templates: {
        article: 'Articles/custom-article.md',
        fragment: 'Fragments/custom-fragment.md',
        reading: 'Reading/custom-reading.md',
        ai: 'AI/custom-ai.md'
      }
    });

    widget.destroy();
  });
});
