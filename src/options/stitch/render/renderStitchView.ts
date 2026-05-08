import { readPath } from '@options/schema-runtime/binding';
import type { el } from '../ui/dom';
import type { previewUi } from '../ui/components';
import type {
  ActionDescriptor,
  ActionReference,
  ButtonNode,
  ChipsNode,
  DynamicValue,
  ElementNode,
  GridNode,
  GroupNode,
  InputNode,
  ListNode,
  NodeChild,
  NoticeNode,
  ResourceCardNode,
  SchemaContext,
  SegmentedNavNode,
  SelectNode,
  SwitchNode,
  TableCellSchema,
  TableNode,
  TextareaNode,
  ViewSchema,
  WidgetNode
} from '../types';

interface RendererContext extends SchemaContext {
  el: typeof el;
  ui: typeof previewUi;
  dispatch: (id: string, args?: unknown[], value?: unknown, event?: Event) => void;
  mountWidget?: (widgetType: string, host: HTMLElement, props?: Record<string, unknown>) => void;
}

interface RenderedTableCell {
  props?: Record<string, string | number | boolean> | undefined;
  node?: Node | null | undefined;
  text?: string | number | undefined;
  html?: string | undefined;
}

const HIGHLIGHT_THEMES: Record<string, { className: string }> = {
  gradient: { className: 'highlight-gradient' },
  purple: { className: 'highlight-purple' },
  neonYellow: { className: 'highlight-neon-yellow' },
  neonGreen: { className: 'highlight-neon-green' },
  neonOrange: { className: 'highlight-neon-orange' }
};

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

function renderNodeList(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): Node[] {
  return normalizeNodes(nodes, ctx)
    .map((node) => renderNode(node, ctx))
    .filter((node): node is Node => Boolean(node));
}

function renderNode(node: NodeChild, ctx: RendererContext): Node | null {
  const resolved = resolveValue(node, ctx);
  if (resolved === null || resolved === undefined || resolved === false) {
    return null;
  }

  if (resolved instanceof HTMLElement) {
    return resolved;
  }

  if (typeof resolved === 'string' || typeof resolved === 'number') {
    return ctx.el('span', { text: String(resolved) });
  }

  if (Array.isArray(resolved)) {
    return renderContent(resolved, ctx);
  }

  switch (resolved.kind) {
    case 'group':
      return ctx.ui.Group(
        resolveValue(resolved.title, ctx) ?? '',
        renderGroupContent(resolved, ctx)
      );
    case 'card':
      return ctx.ui.Card({
        title: resolveValue(resolved.title, ctx),
        description: resolveValue(resolved.description, ctx),
        actions: renderInlineNodes(resolved.actions, ctx),
        body: renderContent(
          resolved.body ?? resolved.children,
          ctx,
          resolveValue(resolved.bodyClassName, ctx)
        ),
        extraClass: resolveValue(resolved.extraClass, ctx) || ''
      });
    case 'rows':
      return ctx.ui.Rows(renderNodeList(resolved.items, ctx));
    case 'row':
      return ctx.ui.Row({
        title: resolveValue(resolved.title, ctx) ?? '',
        description: resolveValue(resolved.description, ctx) ?? '',
        control: renderContent(resolved.control, ctx)
      });
    case 'field':
      return ctx.ui.Field(
        resolveValue(resolved.label, ctx) || '',
        renderContent(resolved.control, ctx)
      );
    case 'input':
      return renderInputNode(resolved, ctx);
    case 'textarea':
      return renderTextareaNode(resolved, ctx);
    case 'select':
      return renderSelectNode(resolved, ctx);
    case 'switch':
      return renderSwitchNode(resolved, ctx);
    case 'button':
      return renderButtonNode(resolved, ctx);
    case 'badge':
      return ctx.ui.Badge(
        resolveValue(resolved.label, ctx) ?? '',
        resolveValue(resolved.variant, ctx) || ''
      );
    case 'pill':
      return ctx.ui.Pill(resolveValue(resolved.label, ctx) ?? '');
    case 'statsGrid':
      return ctx.ui.StatsGrid(resolveValue(resolved.items, ctx) || []);
    case 'usageChart':
      return renderUsageChartShell(ctx);
    case 'notice':
      return ctx.ui.Notice({
        title: resolveValue(resolved.title, ctx) ?? '',
        body: renderNoticeBody(resolved.body, ctx),
        variant: resolveValue(resolved.variant, ctx) || 'info'
      });
    case 'table':
      return renderTableNode(resolved, ctx);
    case 'tokenRow':
      return ctx.ui.TokenRow(resolveValue(resolved.tokens, ctx) || [], {
        onTokenClick: resolved.action
          ? (value) => runAction(resolved.action, ctx, value)
          : undefined,
        activeToken: resolveValue(resolved.activeToken, ctx)
      });
    case 'segmentedNav':
      return ctx.ui.SegmentedNav(
        resolveValue(resolved.items, ctx) || [],
        resolveNodeValue(resolved, ctx) as string | number | undefined,
        (value) => runAction(resolved.action, ctx, value)
      );
    case 'details':
      return ctx.el(
        'details',
        {
          className: ['advanced', resolveValue(resolved.className, ctx) || '']
            .filter(Boolean)
            .join(' '),
          open: resolveValue(resolved.open, ctx) ?? false,
          style: resolveValue(resolved.style, ctx)
        },
        ctx.el('summary', { text: resolveValue(resolved.summary, ctx) }),
        ctx.el(
          'div',
          {
            className: ['advanced-body', resolveValue(resolved.bodyClassName, ctx) || '']
              .filter(Boolean)
              .join(' ')
          },
          renderNodeList(resolved.children, ctx)
        )
      );
    case 'stack':
      return ctx.el(
        resolved.tag || 'div',
        {
          className: ['stack', resolveValue(resolved.className, ctx) || '']
            .filter(Boolean)
            .join(' '),
          style: resolveValue(resolved.style, ctx),
          dataset: resolveValue(resolved.dataset, ctx)
        },
        renderNodeList(resolved.children, ctx)
      );
    case 'grid':
      return ctx.el(
        'div',
        {
          className: buildGridClassName(resolved, ctx),
          style: resolveValue(resolved.style, ctx),
          dataset: resolveValue(resolved.dataset, ctx)
        },
        renderNodeList(resolved.children, ctx)
      );
    case 'miniCard':
      return ctx.ui.MiniCard(
        resolveValue(resolved.title, ctx) ?? '',
        renderContent(resolved.content ?? resolved.children, ctx)
      );
    case 'chips':
      return renderChipsNode(resolved, ctx);
    case 'list':
      return renderListNode(resolved, ctx);
    case 'resourceCard':
      return renderResourceCardNode(resolved, ctx);
    case 'highlightExample':
      return renderHighlightExampleNode(ctx);
    case 'widget':
      return renderWidgetNode(resolved, ctx);
    case 'element':
      return renderElementNode(resolved, ctx);
    default:
      return null;
  }
}

function renderInlineNodes(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): HTMLElement[] {
  return normalizeNodes(nodes, ctx)
    .map((node) => renderNode(node, ctx))
    .filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function renderGroupContent(groupNode: GroupNode, ctx: RendererContext): Node {
  const children = renderNodeList(groupNode.children, ctx);
  if (children.length === 1) {
    return children[0];
  }

  return ctx.el(
    'div',
    {
      className: ['stack', resolveValue(groupNode.contentClassName, ctx) || '']
        .filter(Boolean)
        .join(' ')
    },
    children
  );
}

function renderContent(
  content: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext,
  className?: string
): Node {
  const nodes = renderNodeList(content, ctx);
  if (!nodes.length) {
    return ctx.el('div');
  }
  if (nodes.length === 1 && !className) {
    return nodes[0];
  }
  return ctx.el('div', { className: className || 'stack' }, nodes);
}

function renderInputNode(node: InputNode, ctx: RendererContext): HTMLInputElement {
  const value = resolveNodeValue(node, ctx) ?? '';
  return ctx.ui.Input(value as string | number, {
    mono: resolveValue(node.mono, ctx),
    type: resolveValue(node.type, ctx),
    placeholder: resolveValue(node.placeholder, ctx),
    disabled: resolveValue(node.disabled, ctx),
    readOnly: resolveValue(node.readOnly, ctx),
    min: resolveValue(node.min, ctx),
    max: resolveValue(node.max, ctx),
    step: resolveValue(node.step, ctx),
    className: resolveValue(node.className, ctx),
    dataset: resolveValue(node.dataset, ctx),
    onInput: node.onInput ? (event: Event) => runEventAction(node.onInput, event, ctx) : undefined,
    onChange: node.onChange
      ? (event: Event) => runEventAction(node.onChange, event, ctx)
      : undefined,
    onFocus: node.onFocus ? (event: Event) => runEventAction(node.onFocus, event, ctx) : undefined,
    onBlur: node.onBlur ? (event: Event) => runEventAction(node.onBlur, event, ctx) : undefined,
    onClick: node.onClick
      ? (event: MouseEvent) => {
          event.preventDefault();
          runEventAction(node.onClick, event, ctx);
        }
      : undefined,
    onKeyUp: node.onKeyUp
      ? (event: KeyboardEvent) => runEventAction(node.onKeyUp, event, ctx)
      : undefined,
    onSelect: node.onSelect
      ? (event: Event) => runEventAction(node.onSelect, event, ctx)
      : undefined,
    onMouseEnter: node.onMouseEnter
      ? (event: MouseEvent) => runEventAction(node.onMouseEnter, event, ctx)
      : undefined
  });
}

function renderSelectNode(node: SelectNode, ctx: RendererContext): HTMLSelectElement {
  return ctx.ui.Select(
    resolveValue(node.options, ctx) || [],
    resolveNodeValue(node, ctx) as string | number | undefined,
    {
      className: resolveValue(node.className, ctx),
      disabled: resolveValue(node.disabled, ctx),
      onChange: node.onChange
        ? (event: Event) => runEventAction(node.onChange, event, ctx)
        : undefined
    }
  );
}

function renderTextareaNode(node: TextareaNode, ctx: RendererContext): HTMLTextAreaElement {
  return ctx.ui.Textarea((resolveNodeValue(node, ctx) ?? '') as string | number, {
    className: resolveValue(node.className, ctx),
    placeholder: resolveValue(node.placeholder, ctx),
    disabled: resolveValue(node.disabled, ctx),
    dataset: resolveValue(node.dataset, ctx),
    onInput: node.onInput ? (event: Event) => runEventAction(node.onInput, event, ctx) : undefined,
    onChange: node.onChange
      ? (event: Event) => runEventAction(node.onChange, event, ctx)
      : undefined,
    onFocus: node.onFocus ? (event: Event) => runEventAction(node.onFocus, event, ctx) : undefined,
    onBlur: node.onBlur ? (event: Event) => runEventAction(node.onBlur, event, ctx) : undefined
  });
}

function renderSwitchNode(node: SwitchNode, ctx: RendererContext): Element | null {
  const switchNode = ctx.ui.SwitchRow({
    checked:
      node.checked !== undefined
        ? Boolean(resolveValue(node.checked, ctx))
        : Boolean(resolveNodeValue(node, ctx)),
    disabled: Boolean(resolveValue(node.disabled, ctx)),
    stateText: resolveValue(node.stateText, ctx) || '',
    onClick: node.onClick
      ? (event: MouseEvent) => runEventAction(node.onClick, event, ctx)
      : undefined,
    onChange: node.onChange
      ? (event: Event) => runEventAction(node.onChange, event, ctx)
      : undefined
  });
  return resolveValue(node.compact, ctx) ? switchNode.firstElementChild : switchNode;
}

function renderButtonNode(node: ButtonNode, ctx: RendererContext): HTMLButtonElement {
  const action = resolveValue(node.action, ctx);
  const button = ctx.ui.Button(resolveValue(node.label, ctx) ?? '', {
    variant: resolveValue(node.variant, ctx),
    disabled: Boolean(resolveValue(node.disabled, ctx)),
    onClick: action
      ? (event: MouseEvent) => {
          event.preventDefault();
          runAction(action, ctx, undefined, event);
        }
      : undefined
  });
  if (typeof action === 'string') {
    button.dataset.actionId = action;
  } else if (action?.id) {
    button.dataset.actionId = action.id;
  }
  return button;
}

function renderTableNode(node: TableNode, ctx: RendererContext): HTMLDivElement {
  const rows = (resolveValue(node.rows, ctx) || []).map((row) => ({
    rowProps: resolveValue(row.rowProps, ctx) || {},
    cells: (row.cells || []).map((cell) => renderTableCell(cell, ctx))
  }));

  return ctx.ui.Table({
    columns: resolveValue(node.columns, ctx) || [],
    rows,
    rowClassName: resolveValue(node.rowClassName, ctx)
  });
}

function renderTableCell(
  cell: TableCellSchema | NodeChild | string | number,
  ctx: RendererContext
): RenderedTableCell {
  const resolved = typeof cell === 'function' ? cell(ctx) : cell;
  if (isTableCellSchema(resolved)) {
    return {
      props: resolveValue(resolved.props, ctx),
      node: resolved.node !== undefined ? renderNode(resolved.node, ctx) : undefined,
      text: resolved.text !== undefined ? resolveValue(resolved.text, ctx) : undefined,
      html: resolved.html !== undefined ? resolveValue(resolved.html, ctx) : undefined
    };
  }

  if (resolved && typeof resolved === 'object' && resolved.kind) {
    return { node: renderNode(resolved, ctx) };
  }

  return { text: resolved !== undefined ? String(resolved) : '' };
}

function isTableCellSchema(value: unknown): value is TableCellSchema {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    value !== null &&
    !('kind' in value) &&
    ('node' in value || 'text' in value || 'html' in value || 'props' in value)
  );
}

function renderChipsNode(node: ChipsNode, ctx: RendererContext): HTMLDivElement {
  const items = resolveValue(node.items, ctx) || [];
  return ctx.el(
    'div',
    { className: 'chips' },
    items.map((item, index) => {
      const itemObject = typeof item === 'string' ? null : item;
      const value = itemObject?.value ?? itemObject?.label ?? item;
      const label = itemObject?.label ?? String(item);
      const pressed = itemObject?.pressed ?? index === 0;
      if (resolveValue(node.readonly, ctx) || itemObject?.readonly) {
        return ctx.el('button', {
          type: 'button',
          className: 'chip is-readonly',
          'aria-pressed': pressed ? 'true' : 'false',
          text: label
        });
      }

      return ctx.el('button', {
        type: 'button',
        className: 'chip',
        'aria-pressed': pressed ? 'true' : 'false',
        text: label,
        dataset: { value: String(value) },
        onMousedown: (event: MouseEvent) => event.preventDefault(),
        onClick: (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          runAction(node.action, ctx, value, event);
        }
      });
    })
  );
}

function renderListNode(node: ListNode, ctx: RendererContext): HTMLElement {
  const items = resolveValue(node.items, ctx) || [];
  const tag = resolveValue(node.ordered, ctx) ? 'ol' : 'ul';
  return ctx.el(
    tag,
    {
      className: [
        resolveValue(node.className, ctx) || 'info-list',
        resolveValue(node.compact, ctx) ? 'compact' : ''
      ]
        .filter(Boolean)
        .join(' ')
    },
    items.map((item) => ctx.el('li', {}, renderContent(item, ctx)))
  );
}

function renderResourceCardNode(node: ResourceCardNode, ctx: RendererContext): HTMLElement {
  const href = resolveValue(node.href, ctx);
  const isStatic = !href;
  const tag = isStatic ? 'div' : 'a';
  const title = resolveValue(node.title, ctx);
  const subtitle = resolveValue(node.subtitle, ctx);

  return ctx.el(
    tag,
    isStatic
      ? { className: 'resource-link-card is-static' }
      : {
          className: 'resource-link-card',
          href,
          target: '_blank',
          rel: 'noopener noreferrer'
        },
    ctx.el(
      'div',
      { className: 'resource-link-copy' },
      ctx.el('strong', { text: title }),
      subtitle ? ctx.el('span', { text: subtitle }) : null
    ),
    isStatic
      ? ctx.ui.Badge('Pending', 'warning')
      : ctx.el('span', { className: 'resource-link-action', text: '打开' })
  );
}

function renderHighlightExampleNode(ctx: RendererContext): HTMLDivElement {
  const theme = HIGHLIGHT_THEMES[ctx.state.highlightTheme] || HIGHLIGHT_THEMES.gradient;
  return ctx.el(
    'div',
    { className: 'highlight-inline-example' },
    ctx.el('span', { text: '导出后的示例会像这样 ' }),
    ctx.el('span', {
      className: ['inline-highlight', theme.className].join(' '),
      text: '标出重点内容'
    }),
    ctx.el('span', { text: '，方便回看。' })
  );
}

function renderUsageChartShell(ctx: RendererContext): HTMLDivElement {
  return ctx.el(
    'div',
    { className: 'usage-chart-shell', dataset: { role: 'usage-chart-shell' } },
    ctx.el('div', { className: 'usage-axis', id: 'usageAxis' }),
    ctx.el(
      'div',
      { className: 'usage-graph' },
      ctx.el(
        'svg' as keyof HTMLElementTagNameMap,
        {
          className: 'usage-svg',
          id: 'usageWave',
          viewBox: '0 0 200 160',
          preserveAspectRatio: 'xMinYMin meet'
        },
        ctx.el('g' as keyof HTMLElementTagNameMap, { id: 'usageGrid' }),
        ctx.el('path' as keyof HTMLElementTagNameMap, {
          id: 'usageFillPath',
          className: 'usage-fill',
          d: 'M0 120 L200 120 L200 132 L0 132 Z'
        }),
        ctx.el('path' as keyof HTMLElementTagNameMap, {
          id: 'usageWavePath',
          className: 'usage-wave',
          d: 'M0 120 L200 120'
        }),
        ctx.el('g' as keyof HTMLElementTagNameMap, { id: 'usageXAxis' })
      )
    )
  );
}

function renderWidgetNode(node: WidgetNode, ctx: RendererContext): HTMLElement {
  const widgetType = resolveValue(node.widgetType, ctx) ?? '';
  const host = ctx.el('div', {
    className: ['stitch-widget-host', resolveValue(node.className, ctx) || '']
      .filter(Boolean)
      .join(' '),
    dataset: {
      stitchWidget: widgetType,
      ...(resolveValue(node.dataset, ctx) || {})
    }
  });
  ctx.mountWidget?.(widgetType, host, resolveValue(node.props, ctx));
  return host;
}

function renderElementNode(node: ElementNode, ctx: RendererContext): HTMLElement {
  return ctx.el(
    node.tag || 'div',
    {
      className: resolveValue(node.className, ctx),
      text: node.text !== undefined ? String(resolveValue(node.text, ctx) ?? '') : undefined,
      html: node.html !== undefined ? resolveValue(node.html, ctx) : undefined,
      style: resolveValue(node.style, ctx),
      dataset: resolveValue(node.dataset, ctx),
      src: resolveValue(node.src, ctx),
      alt: resolveValue(node.alt, ctx),
      href: resolveValue(node.href, ctx),
      target: resolveValue(node.target, ctx),
      rel: resolveValue(node.rel, ctx),
      type: resolveValue(node.type, ctx),
      role: resolveValue(node.role, ctx),
      'aria-pressed': resolveValue(node.ariaPressed, ctx),
      'aria-label': resolveValue(node.ariaLabel, ctx),
      disabled: resolveValue(node.disabled, ctx),
      onClick: node.onClick ? (event: Event) => runEventAction(node.onClick, event, ctx) : undefined
    },
    renderNodeList(node.children, ctx)
  );
}

function renderNoticeBody(body: NoticeNode['body'], ctx: RendererContext): string | Node {
  const resolved = resolveValue(body, ctx);
  if (typeof resolved === 'string') {
    return resolved;
  }
  return renderContent(resolved, ctx);
}

function buildGridClassName(node: GridNode, ctx: RendererContext): string {
  const columns = resolveValue(node.columns, ctx);
  const classNames: string[] = [];

  switch (columns) {
    case 2:
    case '2':
      classNames.push('grid-2');
      break;
    case 3:
    case '3':
      classNames.push('grid-3');
      break;
    case 4:
    case '4':
      classNames.push('grid-4');
      break;
    case 'mini':
      classNames.push('mini-grid');
      break;
    default:
      classNames.push('grid-2');
      break;
  }

  const extra = resolveValue(node.className, ctx);
  if (extra) {
    classNames.push(extra);
  }

  return classNames.join(' ');
}

function resolveHero(
  hero: ViewSchema['hero'],
  ctx: RendererContext
): { title: string; description: string; pills: string[]; icon?: string } {
  const resolved = resolveValue(hero, ctx);
  const icon = resolved ? resolveValue(resolved.icon, ctx) : undefined;
  return {
    title: resolved ? (resolveValue(resolved.title, ctx) ?? '') : '',
    description: resolved ? (resolveValue(resolved.description, ctx) ?? '') : '',
    pills: resolved ? resolveValue(resolved.pills, ctx) || [] : [],
    ...(icon ? { icon } : {})
  };
}

function resolveNodeValue(
  node: InputNode | TextareaNode | SelectNode | SwitchNode | SegmentedNavNode,
  ctx: RendererContext
): unknown {
  if ('value' in node && node.value !== undefined) {
    return resolveValue(node.value, ctx);
  }
  if (node.bind !== undefined) {
    return resolveBinding(node.bind, ctx);
  }
  return undefined;
}

function resolveBinding(
  binding: string | import('../types').StateBinding | undefined,
  ctx: RendererContext
): unknown {
  if (binding === undefined || binding === null) {
    return undefined;
  }
  if (typeof binding === 'string') {
    return readPath(ctx.state, binding);
  }

  const source = binding.source || 'state';
  const root = source === 'appData' ? ctx.appData : source === 'context' ? ctx : ctx.state;
  return readPath(root, binding.path);
}

function runEventAction(
  action: DynamicValue<ActionDescriptor> | undefined,
  event: Event,
  ctx: RendererContext
): void {
  const resolved = resolveValue(action, ctx);
  if (!resolved) {
    return;
  }

  const extracted = resolved.valueFrom ? extractEventValue(event, resolved.valueFrom) : undefined;
  runAction(resolved, ctx, extracted, event);
}

function runAction(
  action: DynamicValue<ActionReference> | undefined,
  ctx: RendererContext,
  runtimeValue?: unknown,
  event?: Event
): void {
  const resolved = resolveValue(action, ctx);
  if (!resolved) {
    return;
  }

  if (typeof resolved === 'string') {
    ctx.dispatch(resolved, [], runtimeValue, event);
    return;
  }

  const args = normalizeActionArgs(resolveValue(resolved.args, ctx));
  const transformedValue =
    typeof resolved.transform === 'function'
      ? resolved.transform(runtimeValue, ctx, event)
      : runtimeValue;

  ctx.dispatch(resolved.id, args, transformedValue === undefined ? event : transformedValue, event);
}

function normalizeActionArgs(args: unknown[] | undefined | null): unknown[] {
  if (args === undefined || args === null) {
    return [];
  }
  return Array.isArray(args) ? args : [args];
}

function extractEventValue(
  event: Event | undefined,
  valueFrom: ActionDescriptor['valueFrom']
): unknown {
  switch (valueFrom) {
    case 'target.checked':
      return event?.target instanceof HTMLInputElement ? event.target.checked : undefined;
    case 'target.value':
    default:
      return event?.target instanceof HTMLInputElement ||
        event?.target instanceof HTMLSelectElement ||
        event?.target instanceof HTMLTextAreaElement
        ? event.target.value
        : undefined;
  }
}

function normalizeNodes(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): NodeChild[] {
  const resolved = resolveValue(nodes, ctx);
  if (resolved === undefined || resolved === null || resolved === false) {
    return [];
  }
  return Array.isArray(resolved) ? resolved : [resolved];
}

function resolveValue<T>(value: DynamicValue<T> | undefined, ctx: RendererContext): T | undefined {
  return typeof value === 'function' ? (value as (ctx: SchemaContext) => T)(ctx) : value;
}
export const schemaRenderer = {
  renderView: renderPreviewView
};

export const renderStitchView = renderPreviewView;
