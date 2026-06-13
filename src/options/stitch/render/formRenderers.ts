import {
  resolveNodeValue,
  resolveValue,
  runAction,
  runEventAction,
  type RendererContext
} from './actionAdapter';
import type {
  ButtonNode,
  ChipsNode,
  InputNode,
  SegmentedNavNode,
  SelectNode,
  SwitchNode,
  TextareaNode
} from '../types';

export function renderInputNode(node: InputNode, ctx: RendererContext): HTMLInputElement {
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

export function renderTextareaNode(node: TextareaNode, ctx: RendererContext): HTMLTextAreaElement {
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

export function renderButtonNode(node: ButtonNode, ctx: RendererContext): HTMLButtonElement {
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
  const dataset = resolveValue(node.dataset, ctx);
  if (dataset) {
    Object.entries(dataset).forEach(([key, value]) => {
      button.dataset[key] = String(value);
    });
  }
  if (typeof action === 'string') {
    button.dataset.actionId = action;
  } else if (action?.id) {
    button.dataset.actionId = action.id;
  }
  return button;
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
