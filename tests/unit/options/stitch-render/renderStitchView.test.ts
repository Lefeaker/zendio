/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { previewContent } from '@options/stitch/content';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
import { el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import type { PreviewStoreState, ViewSchema } from '@options/stitch/types';

function createState(): PreviewStoreState {
  return {
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
    highlightTheme: 'neonGreen',
    fragmentModifierEnabled: false,
    modifierKeys: [],
    yamlFieldStates: {},
    routingRules: [],
    templateValues: {},
    activeTemplateField: '',
    pendingTemplateFocus: null,
    pendingTemplateSelection: null
  };
}

function createContext(overrides: Partial<RendererContext> = {}): RendererContext {
  return {
    appData: previewContent,
    state: createState(),
    el,
    ui: previewUi,
    dispatch: vi.fn(),
    ...overrides
  };
}

describe('Stitch schema renderer split', () => {
  it('renders renderer-owned labels from schema content instead of renderer constants', () => {
    const ctx = createContext({
      appData: {
        ...previewContent,
        rendererLabels: {
          resourcePendingBadge: 'Queued',
          resourceOpenAction: 'Open now',
          highlightExamplePrefix: 'Before ',
          highlightExampleText: 'selected text',
          highlightExampleSuffix: ' after.'
        }
      }
    });
    const view: ViewSchema = {
      id: 'renderer-labels',
      kind: 'page',
      children: [
        { kind: 'resourceCard', title: 'Roadmap' },
        { kind: 'resourceCard', title: 'Docs', href: 'https://example.test' },
        { kind: 'highlightExample' }
      ]
    };

    const node = renderPreviewView(view, ctx);

    expect(node?.textContent).toContain('Queued');
    expect(node?.textContent).toContain('Open now');
    expect(node?.textContent).toContain('Before selected text after.');
    expect(node?.querySelector('.inline-highlight')?.className).toContain('highlight-neon-green');
  });

  it('wires form renderer actions through the action adapter', () => {
    const dispatch = vi.fn();
    const view: ViewSchema = {
      id: 'form-action',
      kind: 'page',
      children: [
        {
          kind: 'input',
          value: 'old',
          onInput: {
            id: 'field:update',
            args: ['field'],
            valueFrom: 'target.value'
          }
        }
      ]
    };
    const node = renderPreviewView(view, createContext({ dispatch }));
    const input = node?.querySelector('input');
    if (!input) {
      throw new Error('Expected rendered input');
    }

    input.value = 'new';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(dispatch).toHaveBeenCalledWith('field:update', ['field'], 'new', expect.any(Event));
  });
});
