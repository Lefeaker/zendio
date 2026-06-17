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
        { kind: 'resourceCard', title: 'Roadmap', icon: './icons/github-fill.svg' },
        { kind: 'resourceCard', title: 'Docs', href: 'https://example.test' },
        {
          kind: 'resourceCard',
          title: 'WeChat',
          image: './icons/wechat-reward-qr.jpg',
          imageAlt: 'WeChat reward code'
        },
        { kind: 'highlightExample' }
      ]
    };

    const node = renderPreviewView(view, ctx);

    expect(node?.textContent).toContain('Queued');
    expect(node?.textContent).toContain('Open now');
    expect(node?.textContent).toContain('Before selected text after.');
    expect(node?.querySelector('img.resource-link-icon')?.getAttribute('src')).toBe(
      './icons/github-fill.svg'
    );
    expect(node?.querySelector('img.resource-link-preview')?.getAttribute('src')).toBe(
      './icons/wechat-reward-qr.jpg'
    );
    expect(node?.querySelector('img.resource-link-preview')?.getAttribute('alt')).toBe(
      'WeChat reward code'
    );
    expect(node?.querySelector('.inline-highlight')?.className).toContain('highlight-neon-green');
  });

  it('resolves resource card assets through the render context when provided', () => {
    const ctx: RendererContext & { resolveAssetUrl: (path: string) => string } = {
      ...createContext(),
      resolveAssetUrl: (path) =>
        `chrome-extension://unit/${path.startsWith('./') ? path.slice(2) : path}`
    };
    const view: ViewSchema = {
      id: 'renderer-asset-urls',
      kind: 'page',
      children: [
        {
          kind: 'resourceCard',
          title: 'WeChat',
          icon: './icons/wechat-reward.svg',
          image: './icons/wechat-reward-qr.jpg',
          imageAlt: 'WeChat reward code'
        }
      ]
    };

    const node = renderPreviewView(view, ctx);

    expect(node?.querySelector('img.resource-link-icon')?.getAttribute('src')).toBe(
      'chrome-extension://unit/icons/wechat-reward.svg'
    );
    expect(node?.querySelector('img.resource-link-preview')?.getAttribute('src')).toBe(
      'chrome-extension://unit/icons/wechat-reward-qr.jpg'
    );
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
