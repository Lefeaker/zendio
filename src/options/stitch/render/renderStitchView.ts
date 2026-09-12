import {
  renderRuntimeSurface,
  type RuntimeSurfaceContext,
  type RuntimeViewSchema
} from '@ui/stitch-runtime';
import { isRuntimeSurfaceId } from '@ui/stitch-surfaces';
import type { RendererContext } from './actionAdapter';
import { renderNodeList, resolveHero, withOptionsExtensionRenderers } from './nodeRenderers';
import { projectSurfaceContext } from '../schema/registry';
import type { OptionsExtensionNode, OptionsViewSchema, ViewSchema } from '../types';

export type { RendererContext } from './actionAdapter';

export function renderPreviewView(view: ViewSchema, ctx: RendererContext): HTMLElement | null {
  const resolved = view;

  if (isRuntimeSurfaceView(resolved)) {
    return renderRuntimeSurface(resolved, {
      ...projectSurfaceContext(ctx),
      el: ctx.el,
      ui: ctx.ui,
      dispatch: ctx.dispatch
    });
  }

  switch (resolved.kind) {
    case 'page':
      return renderPageView(resolved, ctx);
    case 'standalone-page':
      return resolved.hero
        ? renderPageView(resolved, ctx)
        : renderRuntimeSurface(
            projectRuntimeView(resolved, 'standalone-page'),
            withOptionsExtensionRenderers(ctx)
          );
    case 'modal':
      return renderRuntimeSurface(
        projectRuntimeView(resolved, 'modal'),
        withOptionsExtensionRenderers(ctx)
      );
    default:
      return null;
  }
}

function renderPageView(view: OptionsViewSchema, ctx: RendererContext): HTMLElement {
  return ctx.el(
    'section',
    {
      className: view.className,
      dataset: view.dataset
    },
    view.hero ? ctx.ui.Hero(resolveHero(view.hero, ctx)) : null,
    renderNodeList(view.children, ctx)
  );
}

function projectRuntimeView(
  view: OptionsViewSchema,
  kind: 'modal' | 'standalone-page'
): RuntimeViewSchema<RendererContext, OptionsExtensionNode> {
  return {
    id: view.id,
    kind,
    ...(view.className ? { className: view.className } : {}),
    ...(view.dataset ? { dataset: view.dataset } : {}),
    ...(view.title ? { title: view.title } : {}),
    ...(view.description ? { description: view.description } : {}),
    ...(view.size ? { size: view.size } : {}),
    ...(view.surfacePlacement ? { surfacePlacement: view.surfacePlacement } : {}),
    ...(view.surfaceSkin ? { surfaceSkin: view.surfaceSkin } : {}),
    ...(view.children ? { children: view.children } : {})
  };
}

function isRuntimeSurfaceView(view: ViewSchema): view is RuntimeViewSchema<RuntimeSurfaceContext> {
  return isRuntimeSurfaceId(view.id);
}

export const schemaRenderer = {
  renderView: renderPreviewView
};

export const renderStitchView = renderPreviewView;
