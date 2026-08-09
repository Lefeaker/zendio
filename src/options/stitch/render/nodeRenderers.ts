import {
  createRuntimeExtensionRendererRegistry,
  renderRuntimeNode,
  type RuntimeNodeRendererContext
} from '@ui/stitch-runtime';
import {
  normalizeNodes,
  resolveBinding as resolveOptionsBinding,
  resolveValue,
  type RendererContext
} from './actionAdapter';
import {
  renderChipsNode,
  renderSegmentedNavNode,
  renderSelectNode,
  renderSwitchNode
} from './formRenderers';
import {
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
import type {
  DynamicValue,
  GridNode,
  GroupNode,
  NodeChild,
  OptionsViewSchema,
  OptionsExtensionNode
} from '../types';

const callbacks: ContentRenderCallbacks = {
  renderNode,
  renderNodeList,
  renderContent
};

const OPTIONS_EXTENSION_KINDS = [
  'group',
  'card',
  'rows',
  'row',
  'field',
  'select',
  'switch',
  'statsGrid',
  'usageChart',
  'notice',
  'table',
  'tokenRow',
  'segmentedNav',
  'details',
  'stack',
  'grid',
  'miniCard',
  'chips',
  'list',
  'resourceCard',
  'highlightExample',
  'widget'
] satisfies readonly OptionsExtensionNode['kind'][];

const optionsExtensionRenderers = createRuntimeExtensionRendererRegistry<
  RendererContext,
  OptionsExtensionNode
>();

OPTIONS_EXTENSION_KINDS.forEach((kind) => {
  optionsExtensionRenderers.register(kind, renderOptionsExtensionNode);
});

export function renderNodeList(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): Node[] {
  return normalizeNodes(nodes, ctx)
    .map((node) => renderNode(node, ctx))
    .filter((node): node is Node => node !== null);
}

export function renderNode(node: NodeChild, ctx: RendererContext): Node | null {
  return renderRuntimeNode<RendererContext, OptionsExtensionNode>(
    node,
    withOptionsExtensionRenderers(ctx)
  );
}

export function withOptionsExtensionRenderers(
  ctx: RendererContext
): RuntimeNodeRendererContext<RendererContext, OptionsExtensionNode> {
  return {
    ...ctx,
    extensionRenderers: optionsExtensionRenderers,
    resolveBinding: (binding) => resolveOptionsBinding(binding, ctx),
    transformActionValue: (action, value, event) => {
      if ('transform' in action && typeof action.transform === 'function') {
        return action.transform(value, ctx, event);
      }
      return value;
    }
  };
}

function renderOptionsExtensionNode(node: OptionsExtensionNode, ctx: RendererContext): Node | null {
  switch (node.kind) {
    case 'group':
      return ctx.ui.Group(resolveValue(node.title, ctx) ?? '', renderGroupContent(node, ctx));
    case 'card':
      return ctx.ui.Card({
        title: resolveValue(node.title, ctx),
        description: resolveValue(node.description, ctx),
        actions: renderInlineNodes(node.actions, ctx),
        body: renderContent(node.body ?? node.children, ctx, resolveValue(node.bodyClassName, ctx)),
        extraClass: resolveValue(node.extraClass, ctx) || ''
      });
    case 'rows':
      return ctx.ui.Rows(renderNodeList(node.items, ctx));
    case 'row':
      return ctx.ui.Row({
        title: resolveValue(node.title, ctx) ?? '',
        description: resolveValue(node.description, ctx) ?? '',
        control: renderContent(node.control, ctx)
      });
    case 'field':
      return ctx.ui.Field(resolveValue(node.label, ctx) || '', renderContent(node.control, ctx));
    case 'select':
      return renderSelectNode(node, ctx);
    case 'switch':
      return renderSwitchNode(node, ctx);
    case 'statsGrid':
      return ctx.ui.StatsGrid(resolveValue(node.items, ctx) || []);
    case 'usageChart':
      return renderUsageChartShell(ctx);
    case 'notice':
      return ctx.ui.Notice({
        title: resolveValue(node.title, ctx) ?? '',
        body: renderNoticeBody(node.body, ctx, callbacks),
        variant: resolveValue(node.variant, ctx) || 'info'
      });
    case 'table':
      return renderTableNode(node, ctx, callbacks);
    case 'tokenRow':
      return renderTokenRowNode(node, ctx);
    case 'segmentedNav':
      return renderSegmentedNavNode(node, ctx);
    case 'details':
      return ctx.el(
        'details',
        {
          className: ['advanced', resolveValue(node.className, ctx) || '']
            .filter(Boolean)
            .join(' '),
          open: resolveValue(node.open, ctx) ?? false,
          style: resolveValue(node.style, ctx)
        },
        ctx.el('summary', { text: resolveValue(node.summary, ctx) }),
        ctx.el(
          'div',
          {
            className: ['advanced-body', resolveValue(node.bodyClassName, ctx) || '']
              .filter(Boolean)
              .join(' ')
          },
          renderNodeList(node.children, ctx)
        )
      );
    case 'stack':
      return ctx.el(
        node.tag || 'div',
        {
          className: ['stack', resolveValue(node.className, ctx) || ''].filter(Boolean).join(' '),
          style: resolveValue(node.style, ctx),
          dataset: resolveValue(node.dataset, ctx)
        },
        renderNodeList(node.children, ctx)
      );
    case 'grid':
      return ctx.el(
        'div',
        {
          className: buildGridClassName(node, ctx),
          style: resolveValue(node.style, ctx),
          dataset: resolveValue(node.dataset, ctx)
        },
        renderNodeList(node.children, ctx)
      );
    case 'miniCard':
      return ctx.ui.MiniCard(
        resolveValue(node.title, ctx) ?? '',
        renderContent(node.content ?? node.children, ctx)
      );
    case 'chips':
      return renderChipsNode(node, ctx);
    case 'list':
      return renderListNode(node, ctx, callbacks);
    case 'resourceCard':
      return renderResourceCardNode(node, ctx);
    case 'highlightExample':
      return renderHighlightExampleNode(ctx);
    case 'widget':
      return renderWidgetNode(node, ctx);
  }
  throw new Error('Unregistered Options extension node kind');
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
  if (!nodes.length) return ctx.el('div');
  if (nodes.length === 1 && !className) return nodes[0];
  return ctx.el('div', { className: className || 'stack' }, nodes);
}

export function resolveHero(
  hero: OptionsViewSchema['hero'],
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
  if (children.length === 1) return children[0];
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
  }
  const extra = resolveValue(node.className, ctx);
  if (extra) classNames.push(extra);
  return classNames.join(' ');
}
