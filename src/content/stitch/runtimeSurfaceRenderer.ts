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
import {
  createRuntimeSurfaceHandle,
  type RuntimeSessionSurfaceId,
  type RuntimeSurfaceHandle
} from '@ui/stitch-runtime/render/renderRuntimeSurface';
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

export type { RuntimeSurfaceHandle } from '@ui/stitch-runtime/render/renderRuntimeSurface';

function resolveRuntimeTheme(explicitTheme?: RuntimeSurfaceTheme): RuntimeSurfaceTheme {
  if (explicitTheme === 'light' || explicitTheme === 'dark') return explicitTheme;
  return getControlledRuntimeTheme() ?? 'dark';
}

function renderStitchRuntimeSurfaceElement(options: RuntimeSurfaceRenderOptions): HTMLElement {
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
  return rendered;
}

export function renderStitchRuntimeSurface(options: RuntimeSurfaceRenderOptions): HTMLElement {
  const rendered = renderStitchRuntimeSurfaceElement(options);
  registerRuntimeSurfaceThemeRoot(rendered);
  return rendered;
}

export function renderStitchRuntimeSessionSurface(
  options: RuntimeSurfaceRenderOptions & { surfaceId: RuntimeSessionSurfaceId }
): RuntimeSurfaceHandle {
  const eventfulTemplate = renderStitchRuntimeSurfaceElement(options);
  const root = eventfulTemplate.cloneNode(true) as HTMLElement;
  const unregisterThemeRoot = registerRuntimeSurfaceThemeRoot(root);
  return createRuntimeSurfaceHandle(root, options.surfaceId, unregisterThemeRoot);
}

export function renderStitchRuntimeSessionTemplate(
  options: RuntimeSurfaceRenderOptions & { surfaceId: RuntimeSessionSurfaceId }
): HTMLElement {
  const root = renderStitchRuntimeSurfaceElement(options).cloneNode(true) as HTMLElement;
  createRuntimeSurfaceHandle(root, options.surfaceId).dispose();
  return root;
}
