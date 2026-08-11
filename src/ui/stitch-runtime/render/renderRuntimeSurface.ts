import type { RuntimeSchemaContext, RuntimeViewSchema } from '../contracts/schema';
import { resolveRuntimeValue } from './actionAdapter';
import { renderRuntimeNodeList, type RuntimeNodeRendererContext } from './nodeRenderers';

export function renderRuntimeSurface<
  TContext extends RuntimeSchemaContext<unknown, unknown>,
  TExtensionNode extends { kind: string } = never
>(
  view: RuntimeViewSchema<TContext, TExtensionNode>,
  ctx: RuntimeNodeRendererContext<TContext, TExtensionNode>
): HTMLElement {
  const placement = resolveRuntimeValue(view.surfacePlacement, ctx) ?? 'dialog';
  const skin = resolveRuntimeValue(view.surfaceSkin, ctx);
  const isNonModalSurface = placement === 'side-right' || placement === 'floating-bottom-right';
  if (view.kind === 'standalone-page') {
    return ctx.el(
      'section',
      { className: view.className, dataset: view.dataset },
      renderRuntimeNodeList(view.children, ctx)
    );
  }
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
          resolveRuntimeValue(view.size, ctx) ?? 'medium',
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
          ctx.el('h2', { text: resolveRuntimeValue(view.title, ctx) }),
          resolveRuntimeValue(view.description, ctx)
            ? ctx.el('p', { text: resolveRuntimeValue(view.description, ctx) })
            : null
        )
      ),
      ctx.el('div', { className: 'resource-modal-body' }, renderRuntimeNodeList(view.children, ctx))
    )
  );
}
