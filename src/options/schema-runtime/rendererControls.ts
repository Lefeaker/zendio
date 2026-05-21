import { resolveBinding, resolveSchemaValue } from './binding';
import type { ActionDescriptor, InputNode, SelectNode, SwitchNode } from './contracts';
import { el } from './dom';
import { asBoolean, asString, joinClassNames, type SchemaRendererRuntime } from './rendererContext';

export function renderInput<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  node: InputNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  const value =
    (node.bind ? resolveBinding(node.bind, ctx) : resolveSchemaValue(node.value, ctx)) ?? '';
  const className = joinClassNames([
    node.kind === 'textarea' ? 'schema-textarea' : 'schema-input',
    asString(resolveSchemaValue(node.className, ctx) ?? '')
  ]);
  const baseProps = {
    className,
    placeholder: resolveSchemaValue(node.placeholder, ctx),
    disabled: asBoolean(resolveSchemaValue(node.disabled, ctx))
  };

  if (node.kind === 'textarea') {
    return el('textarea', {
      ...baseProps,
      value: asString(value),
      onInput: node.action
        ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
        : undefined
    });
  }

  return el('input', {
    ...baseProps,
    type: resolveSchemaValue(node.type, ctx) ?? 'text',
    value: asString(value),
    onInput: node.action
      ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
      : undefined
  });
}

export function renderSelect<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  node: SelectNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  const value =
    (node.bind ? resolveBinding(node.bind, ctx) : resolveSchemaValue(node.value, ctx)) ?? '';
  const select = el('select', {
    className: joinClassNames([
      'schema-select',
      asString(resolveSchemaValue(node.className, ctx) ?? '')
    ]),
    disabled: asBoolean(resolveSchemaValue(node.disabled, ctx)),
    onChange: node.action
      ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
      : undefined
  });

  const options = resolveSchemaValue(node.options, ctx) ?? [];
  options.forEach((option) => {
    select.append(
      el('option', {
        value: option.value,
        selected: option.value === value,
        text: option.label
      })
    );
  });
  return select;
}

export function renderSwitch<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  node: SwitchNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  const checked =
    (node.bind ? resolveBinding(node.bind, ctx) : resolveSchemaValue(node.checked, ctx)) ?? false;
  const stateText = resolveSchemaValue(node.stateText, ctx);

  return el(
    'label',
    { className: 'schema-switch-line' },
    el('input', {
      type: 'checkbox',
      className: 'schema-switch-input',
      checked: asBoolean(checked),
      disabled: asBoolean(resolveSchemaValue(node.disabled, ctx)),
      onChange: node.action
        ? (event: Event) => runtime.dispatch(node.action as ActionDescriptor, event)
        : undefined
    }),
    el('span', { className: 'schema-switch-slider' }),
    stateText ? el('span', { className: 'schema-switch-state', text: asString(stateText) }) : null
  );
}
