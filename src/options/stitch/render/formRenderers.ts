import {
  resolveNodeValue,
  resolveValue,
  runAction,
  runEventAction,
  type RendererContext
} from './actionAdapter';
import type { ChipsNode, SegmentedNavNode, SelectNode, SwitchNode } from '../types';

export function renderSelectNode(node: SelectNode, ctx: RendererContext): HTMLSelectElement {
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

export function renderSwitchNode(node: SwitchNode, ctx: RendererContext): Element | null {
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

export function renderChipsNode(node: ChipsNode, ctx: RendererContext): HTMLDivElement {
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

export function renderSegmentedNavNode(node: SegmentedNavNode, ctx: RendererContext): HTMLElement {
  return ctx.ui.SegmentedNav(
    resolveValue(node.items, ctx) || [],
    resolveNodeValue(node, ctx) as string | number | undefined,
    (value) => runAction(node.action, ctx, value)
  );
}
