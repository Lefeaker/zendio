import { resolveValue, runAction, runEventAction, type RendererContext } from './actionAdapter';
import type {
  DynamicValue,
  ElementNode,
  ListNode,
  NodeChild,
  NoticeNode,
  ResourceCardNode,
  TableCellSchema,
  TableNode,
  WidgetNode
} from '../types';

interface RenderedTableCell {
  props?: Record<string, string | number | boolean> | undefined;
  node?: Node | null | undefined;
  text?: string | number | undefined;
  html?: string | undefined;
}

export interface ContentRenderCallbacks {
  renderNode: (node: NodeChild, ctx: RendererContext) => Node | null;
  renderNodeList: (
    nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
    ctx: RendererContext
  ) => Node[];
  renderContent: (
    content: DynamicValue<NodeChild[] | NodeChild> | undefined,
    ctx: RendererContext,
    className?: string
  ) => Node;
}

const HIGHLIGHT_THEMES: Record<string, { className: string }> = {
  gradient: { className: 'highlight-gradient' },
  purple: { className: 'highlight-purple' },
  neonYellow: { className: 'highlight-neon-yellow' },
  neonGreen: { className: 'highlight-neon-green' },
  neonOrange: { className: 'highlight-neon-orange' }
};

export function renderTableNode(
  node: TableNode,
  ctx: RendererContext,
  callbacks: ContentRenderCallbacks
): HTMLDivElement {
  const rows = (resolveValue(node.rows, ctx) || []).map((row) => ({
    rowProps: resolveValue(row.rowProps, ctx) || {},
    cells: (row.cells || []).map((cell) => renderTableCell(cell, ctx, callbacks))
  }));

  return ctx.ui.Table({
    columns: resolveValue(node.columns, ctx) || [],
    rows,
    rowClassName: resolveValue(node.rowClassName, ctx)
  });
}

export function renderListNode(
  node: ListNode,
  ctx: RendererContext,
  callbacks: ContentRenderCallbacks
): HTMLElement {
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
    items.map((item) => ctx.el('li', {}, callbacks.renderContent(item, ctx)))
  );
}

export function renderResourceCardNode(node: ResourceCardNode, ctx: RendererContext): HTMLElement {
  const href = resolveValue(node.href, ctx);
  const isStatic = !href;
  const tag = isStatic ? 'div' : 'a';
  const title = resolveValue(node.title, ctx);
  const subtitle = resolveValue(node.subtitle, ctx);
  const icon = resolveResourceAssetUrl(resolveValue(node.icon, ctx), ctx);
  const image = resolveResourceAssetUrl(resolveValue(node.image, ctx), ctx);
  const imageAlt = resolveValue(node.imageAlt, ctx);
  const labels = ctx.appData.rendererLabels;
  const className = ['resource-link-card', isStatic ? 'is-static' : '', image ? 'has-preview' : '']
    .filter(Boolean)
    .join(' ');
  const trailing = image
    ? ctx.el('img', {
        className: 'resource-link-preview',
        src: image,
        alt: imageAlt ?? `${title} preview`
      })
    : isStatic
      ? ctx.ui.Badge(labels.resourcePendingBadge, 'warning')
      : ctx.el('span', { className: 'resource-link-action', text: labels.resourceOpenAction });

  return ctx.el(
    tag,
    isStatic
      ? { className }
      : {
          className,
          href,
          target: '_blank',
          rel: 'noopener noreferrer'
        },
    icon
      ? ctx.el('img', {
          className: 'resource-link-icon',
          src: icon,
          alt: `${title} icon`
        })
      : null,
    ctx.el(
      'div',
      { className: 'resource-link-copy' },
      ctx.el('strong', { text: title }),
      subtitle ? ctx.el('span', { text: subtitle }) : null
    ),
    trailing
  );
}

function resolveResourceAssetUrl(
  path: string | undefined,
  ctx: RendererContext
): string | undefined {
  if (!path) {
    return undefined;
  }
  return ctx.resolveAssetUrl ? ctx.resolveAssetUrl(path) : path;
}

export function renderHighlightExampleNode(ctx: RendererContext): HTMLDivElement {
  const labels = ctx.appData.rendererLabels;
  const theme = HIGHLIGHT_THEMES[ctx.state.highlightTheme] || HIGHLIGHT_THEMES.gradient;
  return ctx.el(
    'div',
    { className: 'highlight-inline-example' },
    ctx.el('span', { text: labels.highlightExamplePrefix }),
    ctx.el('span', {
      className: ['inline-highlight', theme.className].join(' '),
      text: labels.highlightExampleText
    }),
    ctx.el('span', { text: labels.highlightExampleSuffix })
  );
}

export function renderUsageChartShell(ctx: RendererContext): HTMLDivElement {
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

export function renderWidgetNode(node: WidgetNode, ctx: RendererContext): HTMLElement {
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

export function renderElementNode(
  node: ElementNode,
  ctx: RendererContext,
  callbacks: ContentRenderCallbacks
): HTMLElement {
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
      'aria-expanded': resolveValue(node.ariaExpanded, ctx),
      'aria-label': resolveValue(node.ariaLabel, ctx),
      disabled: resolveValue(node.disabled, ctx),
      title: resolveValue(node.title, ctx),
      onClick: node.onClick ? (event: Event) => runEventAction(node.onClick, event, ctx) : undefined
    },
    callbacks.renderNodeList(node.children, ctx)
  );
}

export function renderNoticeBody(
  body: NoticeNode['body'],
  ctx: RendererContext,
  callbacks: ContentRenderCallbacks
): string | Node {
  const resolved = resolveValue(body, ctx);
  if (typeof resolved === 'string') {
    return resolved;
  }
  return callbacks.renderContent(resolved, ctx);
}

function renderTableCell(
  cell: TableCellSchema | NodeChild | string | number,
  ctx: RendererContext,
  callbacks: ContentRenderCallbacks
): RenderedTableCell {
  const resolved = typeof cell === 'function' ? cell(ctx) : cell;
  if (isTableCellSchema(resolved)) {
    return {
      props: resolveValue(resolved.props, ctx),
      node: resolved.node !== undefined ? callbacks.renderNode(resolved.node, ctx) : undefined,
      text: resolved.text !== undefined ? resolveValue(resolved.text, ctx) : undefined,
      html: resolved.html !== undefined ? resolveValue(resolved.html, ctx) : undefined
    };
  }

  if (resolved && typeof resolved === 'object' && 'kind' in resolved) {
    return { node: callbacks.renderNode(resolved, ctx) };
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

export function renderTokenRowNode(
  node: import('../types').TokenRowNode,
  ctx: RendererContext
): HTMLElement {
  return ctx.ui.TokenRow(resolveValue(node.tokens, ctx) || [], {
    onTokenClick: node.action ? (value) => runAction(node.action, ctx, value) : undefined,
    activeToken: resolveValue(node.activeToken, ctx)
  });
}
