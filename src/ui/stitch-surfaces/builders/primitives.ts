import type {
  RuntimeActionDescriptor,
  RuntimeActionReference,
  RuntimeButtonVariant,
  RuntimeButtonNode,
  RuntimeDynamicValue,
  RuntimeElementNode,
  RuntimeNodeChild,
  RuntimePreviewStyle,
  RuntimeSurfaceContext
} from '@ui/stitch-runtime';

type ElementTag = keyof HTMLElementTagNameMap;

interface ElementOptions<TContext> {
  className?: RuntimeDynamicValue<string, TContext>;
  text?: RuntimeDynamicValue<string | number, TContext>;
  html?: RuntimeDynamicValue<string, TContext>;
  src?: RuntimeDynamicValue<string, TContext>;
  alt?: RuntimeDynamicValue<string, TContext>;
  href?: RuntimeDynamicValue<string, TContext>;
  target?: RuntimeDynamicValue<string, TContext>;
  rel?: RuntimeDynamicValue<string, TContext>;
  type?: RuntimeDynamicValue<string, TContext>;
  role?: RuntimeDynamicValue<string, TContext>;
  ariaPressed?: RuntimeDynamicValue<string, TContext>;
  ariaExpanded?: RuntimeDynamicValue<string, TContext>;
  ariaHaspopup?: RuntimeDynamicValue<string, TContext>;
  ariaLabel?: RuntimeDynamicValue<string, TContext>;
  disabled?: RuntimeDynamicValue<boolean, TContext>;
  title?: RuntimeDynamicValue<string, TContext>;
  dataset?: RuntimeDynamicValue<Record<string, string | number | boolean>, TContext>;
  style?: RuntimeDynamicValue<RuntimePreviewStyle, TContext>;
  onClick?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
}

export function element<TContext = RuntimeSurfaceContext>(
  tag: ElementTag,
  options?: ElementOptions<TContext>,
  children?: RuntimeDynamicValue<RuntimeNodeChild<TContext>[], TContext>
): RuntimeElementNode<TContext>;
export function element<
  TContext = RuntimeSurfaceContext,
  TExtensionNode extends { kind: string } = never
>(
  tag: ElementTag,
  options?: ElementOptions<TContext>,
  children?: RuntimeDynamicValue<RuntimeNodeChild<TContext, TExtensionNode>[], TContext>
): RuntimeElementNode<TContext, TExtensionNode>;
export function element<
  TContext = RuntimeSurfaceContext,
  TExtensionNode extends { kind: string } = never
>(
  tag: ElementTag,
  options: ElementOptions<TContext> = {},
  children?: RuntimeDynamicValue<RuntimeNodeChild<TContext, TExtensionNode>[], TContext>
): RuntimeElementNode<TContext, TExtensionNode> {
  return { kind: 'element', tag, ...options, ...(children ? { children } : {}) };
}

export function div<TContext = RuntimeSurfaceContext>(
  className: string,
  children?: RuntimeDynamicValue<RuntimeNodeChild<TContext>[], TContext>
): RuntimeElementNode<TContext>;
export function div<
  TContext = RuntimeSurfaceContext,
  TExtensionNode extends { kind: string } = never
>(
  className: string,
  children?: RuntimeDynamicValue<RuntimeNodeChild<TContext, TExtensionNode>[], TContext>
): RuntimeElementNode<TContext, TExtensionNode>;
export function div<
  TContext = RuntimeSurfaceContext,
  TExtensionNode extends { kind: string } = never
>(
  className: string,
  children: RuntimeDynamicValue<RuntimeNodeChild<TContext, TExtensionNode>[], TContext> = []
): RuntimeElementNode<TContext, TExtensionNode> {
  return element<TContext, TExtensionNode>('div', { className }, children);
}

export function span<TContext = RuntimeSurfaceContext>(
  className: string,
  text: RuntimeDynamicValue<string | number, TContext>
): RuntimeElementNode<TContext> {
  return element<TContext>('span', { className, text });
}

export function strong<TContext = RuntimeSurfaceContext>(
  text: RuntimeDynamicValue<string | number, TContext>,
  className?: string
): RuntimeElementNode<TContext> {
  return element<TContext>('strong', { text, ...(className ? { className } : {}) });
}

export function buttonNode<TContext = RuntimeSurfaceContext>(
  label: RuntimeDynamicValue<string, TContext>,
  variant?: RuntimeDynamicValue<RuntimeButtonVariant | undefined, TContext>,
  action?: RuntimeDynamicValue<RuntimeActionReference<TContext>, TContext>,
  disabled?: RuntimeDynamicValue<boolean, TContext>,
  dataset?: RuntimeDynamicValue<Record<string, string | number | boolean>, TContext>
): RuntimeButtonNode<TContext> {
  return {
    kind: 'button',
    label,
    ...(variant ? { variant } : {}),
    ...(action ? { action } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
    ...(dataset ? { dataset } : {})
  };
}
