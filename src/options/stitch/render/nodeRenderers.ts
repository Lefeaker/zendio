import { normalizeNodes, resolveValue, type RendererContext } from './actionAdapter';
import {
  renderButtonNode,
  renderChipsNode,
  renderInputNode,
  renderSegmentedNavNode,
  renderSelectNode,
  renderSwitchNode,
  renderTextareaNode
} from './formRenderers';
import {
  renderElementNode,
  renderHighlightExampleNode,
  renderListNode,
  renderNoticeBody,
  renderResourceCardNode,
  renderTableNode,
  renderTokenRowNode,
  renderUsageChartShell,
  renderWidgetNode,
  type ContentRenderCallbacks
} from './contentRenderers';
import type { DynamicValue, GridNode, GroupNode, NodeChild, ViewSchema } from '../types';

const callbacks: ContentRenderCallbacks = {
  renderNode,
  renderNodeList,
  renderContent
};

export function renderNodeList(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): Node[] {
  return normalizeNodes(nodes, ctx)
    .map((node) => renderNode(node, ctx))
    .filter((node): node is Node => Boolean(node));
}

export function renderNode(node: NodeChild, ctx: RendererContext): Node | null {
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
        body: renderNoticeBody(resolved.body, ctx, callbacks),
        variant: resolveValue(resolved.variant, ctx) || 'info'
      });
    case 'table':
      return renderTableNode(resolved, ctx, callbacks);
    case 'tokenRow':
      return renderTokenRowNode(resolved, ctx);
    case 'segmentedNav':
      return renderSegmentedNavNode(resolved, ctx);
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
      return renderListNode(resolved, ctx, callbacks);
    case 'resourceCard':
      return renderResourceCardNode(resolved, ctx);
    case 'highlightExample':
      return renderHighlightExampleNode(ctx);
    case 'widget':
      return renderWidgetNode(resolved, ctx);
    case 'element':
      return renderElementNode(resolved, ctx, callbacks);
    default:
      return null;
  }
}

export function renderInlineNodes(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): HTMLElement[] {
  return normalizeNodes(nodes, ctx)
    .map((node) => renderNode(node, ctx))
    .filter((node): node is HTMLElement => node instanceof HTMLElement);
}

export function renderContent(
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

export function resolveHero(
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
