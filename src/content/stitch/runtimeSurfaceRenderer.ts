import { getSurfaceView } from '@options/stitch/schema/surfaceRegistry';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
import { el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import type { PreviewContent, PreviewStoreState, SchemaContext } from '@options/stitch/types';
import { getControlledRuntimeTheme, registerRuntimeSurfaceThemeRoot } from './runtimeTheme';

export type RuntimeSurfaceActionArgs = Parameters<RendererContext['dispatch']>[1];
export type RuntimeSurfaceActionValue = Parameters<RendererContext['dispatch']>[2];
export type RuntimeSurfaceActionHandler = (
  event: Event,
  args: RuntimeSurfaceActionArgs,
  value: RuntimeSurfaceActionValue
) => void;

export interface RuntimeSurfaceRenderOptions {
  surfaceId:
    | 'clipper'
    | 'reader'
    | 'video'
    | 'video-control-bar-popover'
    | 'video-floating-prompt'
    | 'task-success';
  appData: PreviewContent;
  state?: Partial<PreviewStoreState>;
  actions?: Record<string, RuntimeSurfaceActionHandler>;
}

function resolveRuntimeTheme(
  explicitTheme?: PreviewStoreState['previewTheme']
): PreviewStoreState['previewTheme'] {
  if (explicitTheme === 'light' || explicitTheme === 'dark') {
    return explicitTheme;
  }
  const runtimeTheme = getControlledRuntimeTheme();
  if (runtimeTheme) {
    return runtimeTheme;
  }
  return 'dark';
}

function createRuntimeState(overrides: Partial<PreviewStoreState> = {}): PreviewStoreState {
  return {
    activePanel: 'overview',
    activeResource: null,
    previewTheme: 'dark',
    previewLanguage: 'zh-CN',
    yamlFilter: 'all',
    readingPathMode: 'custom',
    pageSummaryEnabled: false,
    readingOverlaySummaryEnabled: false,
    subtitleTranslationEnabled: false,
    subtitleTargetLanguage: 'zh-CN',
    experimentalAiConfig: {
      provider: 'compatible',
      model: '',
      apiUrl: '',
      apiKey: ''
    },
    highlightTheme: 'gradient',
    fragmentModifierEnabled: false,
    modifierKeys: [],
    yamlFieldStates: {},
    routingRules: [],
    templateValues: {},
    activeTemplateField: 'articleVideo',
    pendingTemplateFocus: null,
    pendingTemplateSelection: null,
    ...overrides
  };
}

export function renderStitchRuntimeSurface(options: RuntimeSurfaceRenderOptions): HTMLElement {
  const state = createRuntimeState({
    ...options.state,
    previewTheme: resolveRuntimeTheme(options.state?.previewTheme)
  });
  const ctx: SchemaContext = {
    appData: options.appData,
    state
  };
  const view = getSurfaceView(options.surfaceId, ctx);
  if (!view) {
    throw new Error(`Unknown Stitch runtime surface: ${options.surfaceId}`);
  }

  const rendered = renderPreviewView(view, {
    ...ctx,
    el,
    ui: previewUi,
    dispatch: (id, args, value, event) => {
      const handler = options.actions?.[id];
      if (handler) {
        handler(event ?? new Event('stitch-runtime-action'), args, value);
      }
    }
  });

  if (!(rendered instanceof HTMLElement)) {
    throw new Error(`Failed to render Stitch runtime surface: ${options.surfaceId}`);
  }

  rendered.classList.add('stitch-runtime-surface');
  rendered.dataset.stitchSurface = options.surfaceId;
  rendered.setAttribute('data-preview-skin', 'stitch-secondary');
  rendered.setAttribute('data-preview-theme', state.previewTheme);
  registerRuntimeSurfaceThemeRoot(rendered);
  return rendered;
}
