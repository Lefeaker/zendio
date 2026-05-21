import { resolveSchemaValue } from './binding';
import type {
  ActionDescriptor,
  ButtonNode,
  CardNode,
  FieldNode,
  GroupNode,
  NoticeNode,
  RowNode,
  StackNode,
  TokenRowNode
} from './contracts';
import { el } from './dom';
import {
  asString,
  joinClassNames,
  toArray,
  type RenderNode,
  type SchemaRendererRuntime
} from './rendererContext';

export function renderGroup<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  node: GroupNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  return el(
    'section',
    {
      className: joinClassNames([
        'schema-group',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    el('div', {
      className: 'schema-group-title',
      text: asString(resolveSchemaValue(node.title, ctx))
    }),
    el(
      'div',
      { className: 'schema-group-body' },
      toArray(node.children).map((item) => renderNode(item))
    )
  );
}

export function renderStack<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  node: StackNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  return el(
    'div',
    {
      className: joinClassNames([
        'schema-stack',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    toArray(node.children).map((item) => renderNode(item))
  );
}

export function renderRow<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  node: RowNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  return el(
    'div',
    {
      className: joinClassNames([
        'schema-row',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    el(
      'div',
      { className: 'schema-row-label' },
      el('strong', { text: asString(resolveSchemaValue(node.title, ctx)) }),
      node.description
        ? el('span', { text: asString(resolveSchemaValue(node.description, ctx)) })
        : null
    ),
    el(
      'div',
      { className: 'schema-row-control' },
      toArray(node.control).map((item) => renderNode(item))
    )
  );
}

export function renderCard<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  node: CardNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  return el(
    'section',
    {
      className: joinClassNames([
        'schema-card',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    node.title || node.description || node.actions?.length
      ? el(
          'header',
          { className: 'schema-card-header' },
          el(
            'div',
            { className: 'schema-card-copy' },
            node.title ? el('h3', { text: asString(resolveSchemaValue(node.title, ctx)) }) : null,
            node.description
              ? el('p', { text: asString(resolveSchemaValue(node.description, ctx)) })
              : null
          ),
          node.actions?.length
            ? el(
                'div',
                { className: 'schema-card-actions' },
                node.actions.map((item) => renderNode(item))
              )
            : null
        )
      : null,
    el(
      'div',
      { className: 'schema-card-body' },
      toArray(node.children).map((item) => renderNode(item))
    )
  );
}

export function renderField<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  node: FieldNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  return el(
    'div',
    {
      className: joinClassNames([
        'schema-field',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    el('label', {
      className: 'schema-field-label',
      text: asString(resolveSchemaValue(node.label, ctx))
    }),
    el(
      'div',
      { className: 'schema-field-control' },
      toArray(node.control).map((item) => renderNode(item))
    )
  );
}

export function renderButton<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  node: ButtonNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  return el('button', {
    type: 'button',
    className: joinClassNames([
      'schema-button',
      asString(resolveSchemaValue(node.variant, ctx) ?? ''),
      asString(resolveSchemaValue(node.className, ctx) ?? '')
    ]),
    text: asString(resolveSchemaValue(node.label, ctx)),
    onClick: node.action ? () => runtime.dispatch(node.action as ActionDescriptor) : undefined
  });
}

export function renderNotice<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  node: NoticeNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  return el(
    'div',
    {
      className: joinClassNames([
        'schema-notice',
        asString(resolveSchemaValue(node.variant, ctx) ?? 'info'),
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    el('strong', { text: asString(resolveSchemaValue(node.title, ctx)) }),
    node.body ? el('p', { text: asString(resolveSchemaValue(node.body, ctx)) }) : null
  );
}

export function renderTokenRow<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  node: TokenRowNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  const tokens = resolveSchemaValue(node.tokens, ctx) ?? [];
  return el(
    'div',
    {
      className: joinClassNames([
        'schema-token-row',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    tokens.map((token) =>
      el('button', {
        type: 'button',
        className: 'schema-token',
        text: token,
        onMouseDown: (event: Event) => event.preventDefault(),
        onClick: node.action
          ? () => runtime.dispatch(node.action as ActionDescriptor, token)
          : undefined
      })
    )
  );
}
