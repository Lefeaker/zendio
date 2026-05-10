/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  runAction,
  runEventAction,
  type RendererContext
} from '@options/stitch/render/actionAdapter';
import { previewContent } from '@options/stitch/content';
import { el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';

function createContext(): RendererContext {
  return {
    appData: previewContent,
    state: {
      activePanel: 'overview',
      activeResource: null,
      previewTheme: 'dark',
      previewLanguage: 'en',
      yamlFilter: 'all',
      readingPathMode: 'default',
      pageSummaryEnabled: false,
      readingOverlaySummaryEnabled: false,
      subtitleTranslationEnabled: false,
      subtitleTargetLanguage: 'en',
      experimentalAiConfig: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        apiUrl: '',
        apiKey: ''
      },
      highlightTheme: 'gradient',
      fragmentModifierEnabled: false,
      modifierKeys: [],
      yamlFieldStates: {},
      routingRules: [],
      templateValues: {},
      activeTemplateField: '',
      pendingTemplateFocus: null,
      pendingTemplateSelection: null
    },
    el,
    ui: previewUi,
    dispatch: vi.fn()
  };
}

describe('Stitch action adapter', () => {
  it('normalizes action args and forwards transformed runtime values', () => {
    const ctx = createContext();

    runAction(
      {
        id: 'settings:update',
        args: () => ['highlightTheme'],
        transform: (value) => String(value).toUpperCase()
      },
      ctx,
      'purple'
    );

    expect(ctx.dispatch).toHaveBeenCalledWith(
      'settings:update',
      ['highlightTheme'],
      'PURPLE',
      undefined
    );
  });

  it('extracts event values for event-backed actions', () => {
    const ctx = createContext();
    const input = document.createElement('input');
    input.value = 'next-value';

    runEventAction(
      {
        id: 'field:update',
        valueFrom: 'target.value'
      },
      { target: input } as unknown as Event,
      ctx
    );

    expect(ctx.dispatch).toHaveBeenCalledWith('field:update', [], 'next-value', {
      target: input
    });
  });
});
