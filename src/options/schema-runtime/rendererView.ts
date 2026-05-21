import { resolveSchemaValue } from './binding';
import type { ViewSchema } from './contracts';
import { el } from './dom';
import { renderHero } from './rendererHero';
import {
  asString,
  joinClassNames,
  toArray,
  type RenderNode,
  type SchemaRendererExtensions,
  type SchemaRendererRuntime
} from './rendererContext';

export function renderView<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  extensions: SchemaRendererExtensions,
  renderNode: RenderNode<State, AppData>,
  view: ViewSchema<State, AppData>
): HTMLElement {
  const customView = extensions.renderView?.(view);
  if (customView) {
    return customView;
  }

  const ctx = runtime.getContext();

  if (view.kind === 'modal') {
    return el(
      'div',
      {
        className: 'schema-modal-overlay',
        onClick: () => runtime.dispatch('resource:close')
      },
      el(
        'div',
        {
          className: joinClassNames(['schema-modal', view.size ?? 'medium']),
          role: 'dialog',
          ariaModal: 'true',
          onClick: (event: Event) => event.stopPropagation()
        },
        el(
          'div',
          { className: 'schema-modal-header' },
          el(
            'div',
            { className: 'schema-modal-copy' },
            view.title ? el('h3', { text: asString(resolveSchemaValue(view.title, ctx)) }) : null,
            view.description
              ? el('p', { text: asString(resolveSchemaValue(view.description, ctx)) })
              : null
          ),
          el('button', {
            type: 'button',
            className: 'schema-modal-close',
            text: '×',
            onClick: () => runtime.dispatch('resource:close')
          })
        ),
        el(
          'div',
          { className: 'schema-modal-body' },
          toArray(view.children).map((item) => renderNode(item))
        )
      )
    );
  }

  return el(
    'section',
    {
      className: joinClassNames([
        'schema-view',
        view.kind === 'standalone-page' ? 'standalone' : ''
      ])
    },
    renderHero(runtime, view),
    el(
      'div',
      { className: 'schema-view-body' },
      toArray(view.children).map((item) => renderNode(item))
    )
  );
}
