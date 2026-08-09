import { getSurfaceView } from '@ui/stitch-surfaces';
import {
  el,
  renderRuntimeSurface,
  surfaceComponents,
  type RuntimeSurfaceContent,
  type RuntimeSurfaceState,
  type RuntimeSurfaceTheme,
  type RuntimeSurfaceRendererContext
} from '@ui/stitch-runtime';
import { getControlledRuntimeTheme, registerRuntimeSurfaceThemeRoot } from './runtimeTheme';

export type RuntimeSurfaceActionArgs = Parameters<RuntimeSurfaceRendererContext['dispatch']>[1];
export type RuntimeSurfaceActionValue = Parameters<RuntimeSurfaceRendererContext['dispatch']>[2];
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
  appData: RuntimeSurfaceContent;
  state?: Partial<RuntimeSurfaceState>;
  actions?: Record<string, RuntimeSurfaceActionHandler>;
}

function resolveRuntimeTheme(explicitTheme?: RuntimeSurfaceTheme): RuntimeSurfaceTheme {
  if (explicitTheme === 'light' || explicitTheme === 'dark') return explicitTheme;
  return getControlledRuntimeTheme() ?? 'dark';
}

export function renderStitchRuntimeSurface(options: RuntimeSurfaceRenderOptions): HTMLElement {
  const state: RuntimeSurfaceState = {
    previewTheme: resolveRuntimeTheme(options.state?.previewTheme)
  };
  const ctx = { appData: options.appData, state };
  const view = getSurfaceView(options.surfaceId, ctx);
  if (!view) throw new Error(`Unknown Stitch runtime surface: ${options.surfaceId}`);

  const rendered = renderRuntimeSurface(view, {
    ...ctx,
    el,
    ui: surfaceComponents,
    dispatch: (id, args, value, event) => {
      const handler = options.actions?.[id];
      if (handler) handler(event ?? new Event('stitch-runtime-action'), args, value);
    }
  });

  rendered.classList.add('stitch-runtime-surface');
  rendered.dataset.stitchSurface = options.surfaceId;
  rendered.setAttribute('data-preview-skin', 'stitch-secondary');
  rendered.setAttribute('data-preview-theme', state.previewTheme);
  registerRuntimeSurfaceThemeRoot(rendered);
  return rendered;
}
