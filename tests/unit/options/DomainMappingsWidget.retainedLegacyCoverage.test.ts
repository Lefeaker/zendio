/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { DomainMappingsWidget } from '@options/widgets/DomainMappingsWidget';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { CompleteOptions } from '@shared/types/options';

function buildOptions(): CompleteOptions {
  return {
    ...DEFAULT_OPTIONS,
    rest: { ...DEFAULT_OPTIONS.rest },
    templates: { ...DEFAULT_OPTIONS.templates },
    domainMappings: {
      'example.com': 'Example'
    },
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

describe('DomainMappingsWidget', () => {
  it('collects edited mappings from the real widget', () => {
    const container = document.createElement('div');
    const widget = new DomainMappingsWidget();
    widget.mount(container, { options: buildOptions() });

    const nameInput = container.querySelector<HTMLInputElement>('.field-name');
    expect(nameInput).toBeTruthy();

    nameInput!.value = 'Updated Example';
    nameInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(widget.collect()).toEqual({
      domainMappings: {
        'example.com': 'Updated Example'
      }
    });

    widget.destroy();
  });
});
