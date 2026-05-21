import { resolveValue, type RendererContext } from './actionAdapter';
import { renderNodeList, resolveHero } from './nodeRenderers';
import type { ViewSchema } from '../types';

export type { RendererContext } from './actionAdapter';

export function renderPreviewView(view: ViewSchema, ctx: RendererContext): HTMLElement | null {
  const resolved = resolveValue(view, ctx);
  if (!resolved) {
    return null;
  }

  switch (resolved.kind) {
    case 'page':
    case 'standalone-page':
      return renderPageView(resolved, ctx);
    case 'modal':
      return renderModalView(resolved, ctx);
    default:
      return null;
  }
}

function renderPageView(view: ViewSchema, ctx: RendererContext): HTMLElement {
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

function renderModalView(view: ViewSchema, ctx: RendererContext): HTMLElement {
  const placement = resolveValue(view.surfacePlacement, ctx) || 'dialog';
  const skin = resolveValue(view.surfaceSkin, ctx);
  const isNonModalSurface = placement === 'side-right' || placement === 'floating-bottom-right';
  return ctx.el(
    'div',
    {
      className: [
        'resource-modal-overlay',
        placement === 'side-right' ? 'resource-modal-overlay side-right' : '',
        placement === 'floating-bottom-right' ? 'resource-modal-overlay floating-bottom-right' : '',
        skin ? `resource-modal-overlay--${skin}` : ''
      ]
        .filter(Boolean)
        .join(' '),
      onClick: () => ctx.dispatch('resource:close')
    },
    ctx.el(
      'div',
      {
        className: [
          'resource-modal',
          resolveValue(view.size, ctx) || 'medium',
          placement === 'side-right' ? 'side-right' : '',
          placement === 'floating-bottom-right' ? 'floating-bottom-right' : '',
          skin ? `resource-modal--${skin}` : ''
        ]
          .filter(Boolean)
          .join(' '),
        role: 'dialog',
        'aria-modal': isNonModalSurface ? 'false' : 'true',
        onClick: (event: MouseEvent) => event.stopPropagation()
      },
      ctx.el(
        'div',
        { className: 'resource-modal-header' },
        ctx.el(
          'div',
          { className: 'resource-modal-headings' },
          ctx.el('h2', { text: resolveValue(view.title, ctx) }),
          resolveValue(view.description, ctx)
            ? ctx.el('p', { text: resolveValue(view.description, ctx) })
            : null
        )
      ),
      ctx.el('div', { className: 'resource-modal-body' }, renderNodeList(view.children, ctx))
    )
  );
}

export const schemaRenderer = {
  renderView: renderPreviewView
};

export const renderStitchView = renderPreviewView;
