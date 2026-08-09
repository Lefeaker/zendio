import type { RuntimeActionDescriptor, RuntimeActionReference } from './action';
import type { RuntimeStateBinding } from './binding';
import type { RuntimeTranslator } from './translation';

export interface RuntimeSchemaContext<TContent, TState> {
  appData: TContent;
  state: TState;
  t?: RuntimeTranslator;
}

export type RuntimeDynamicValue<T, TContext> = T | ((ctx: TContext) => T);
export type RuntimePreviewStyle = Partial<CSSStyleDeclaration> &
  Record<`--${string}`, string | number>;

export interface RuntimeBaseNode<TContext> {
  kind: string;
  className?: RuntimeDynamicValue<string, TContext>;
  dataset?: RuntimeDynamicValue<Record<string, string | number | boolean>, TContext>;
  style?: RuntimeDynamicValue<RuntimePreviewStyle, TContext>;
}

export type RuntimeNodeChild<TContext, TExtensionNode = never> =
  | RuntimeNodeSchema<TContext, TExtensionNode>
  | Node
  | null
  | false
  | undefined
  | ((ctx: TContext) => RuntimeNodeSchema<TContext, TExtensionNode> | null | false | undefined);

export interface RuntimeElementNode<
  TContext,
  TExtensionNode = never
> extends RuntimeBaseNode<TContext> {
  kind: 'element';
  tag?: keyof HTMLElementTagNameMap;
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
  onClick?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  children?: RuntimeDynamicValue<RuntimeNodeChild<TContext, TExtensionNode>[], TContext>;
}

export interface RuntimeInputNode<TContext> extends RuntimeBaseNode<TContext> {
  kind: 'input';
  bind?: string | RuntimeStateBinding<TContext>;
  value?: RuntimeDynamicValue<string | number, TContext>;
  type?: RuntimeDynamicValue<string, TContext>;
  placeholder?: RuntimeDynamicValue<string, TContext>;
  disabled?: RuntimeDynamicValue<boolean, TContext>;
  readOnly?: RuntimeDynamicValue<boolean, TContext>;
  mono?: RuntimeDynamicValue<boolean, TContext>;
  min?: RuntimeDynamicValue<string | number, TContext>;
  max?: RuntimeDynamicValue<string | number, TContext>;
  step?: RuntimeDynamicValue<string | number, TContext>;
  onInput?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onChange?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onFocus?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onBlur?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onClick?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onKeyUp?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onSelect?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onMouseEnter?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
}

export interface RuntimeTextareaNode<TContext> extends RuntimeBaseNode<TContext> {
  kind: 'textarea';
  bind?: string | RuntimeStateBinding<TContext>;
  value?: RuntimeDynamicValue<string | number, TContext>;
  placeholder?: RuntimeDynamicValue<string, TContext>;
  disabled?: RuntimeDynamicValue<boolean, TContext>;
  onInput?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onChange?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onFocus?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
  onBlur?: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext>;
}

export type RuntimeButtonVariant = 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger';
export interface RuntimeButtonNode<TContext> extends RuntimeBaseNode<TContext> {
  kind: 'button';
  label: RuntimeDynamicValue<string, TContext>;
  variant?: RuntimeDynamicValue<RuntimeButtonVariant | undefined, TContext>;
  action?: RuntimeDynamicValue<RuntimeActionReference<TContext>, TContext>;
  disabled?: RuntimeDynamicValue<boolean, TContext>;
}
export interface RuntimeBadgeNode<TContext> extends RuntimeBaseNode<TContext> {
  kind: 'badge';
  label: RuntimeDynamicValue<string, TContext>;
  variant?: RuntimeDynamicValue<string, TContext>;
}
export interface RuntimePillNode<TContext> extends RuntimeBaseNode<TContext> {
  kind: 'pill';
  label: RuntimeDynamicValue<string, TContext>;
}

export type RuntimeCoreNode<TContext> =
  | RuntimeElementNode<TContext>
  | RuntimeInputNode<TContext>
  | RuntimeTextareaNode<TContext>
  | RuntimeButtonNode<TContext>
  | RuntimeBadgeNode<TContext>
  | RuntimePillNode<TContext>;

type RuntimeCoreNodeWithExtensions<TContext, TExtensionNode> =
  | RuntimeElementNode<TContext, TExtensionNode>
  | Exclude<RuntimeCoreNode<TContext>, RuntimeElementNode<TContext>>;

export type RuntimeNodeSchema<TContext, TExtensionNode = never> =
  | RuntimeCoreNodeWithExtensions<TContext, TExtensionNode>
  | TExtensionNode
  | string
  | number
  | null
  | undefined
  | false;

export interface RuntimeViewSchema<TContext, TExtensionNode = never> {
  id: string;
  kind: 'modal' | 'standalone-page';
  className?: string;
  dataset?: Record<string, string | number | boolean>;
  title?: string;
  description?: string;
  size?: 'medium' | 'large';
  surfacePlacement?: 'dialog' | 'side-right' | 'floating-bottom-right';
  surfaceSkin?: 'clipper' | 'session' | 'task-success';
  children?: RuntimeNodeSchema<TContext, TExtensionNode>[];
}

export interface RuntimeResourceSchema<TContext, TExtensionNode = never> {
  openMode: 'modal' | 'page';
  href?: string;
  createView: (ctx: TContext) => RuntimeViewSchema<TContext, TExtensionNode>;
}

export interface RuntimeRendererComponents {
  Badge(label: string, variant?: string): HTMLSpanElement;
  Pill(label: string): HTMLSpanElement;
  Button(
    label: string,
    options?: import('../surfaceComponents').RuntimeButtonOptions
  ): HTMLButtonElement;
  Input(
    value: string | number,
    options?: import('../surfaceComponents').RuntimeInputOptions
  ): HTMLInputElement;
  Textarea(
    value: string | number,
    options?: import('../surfaceComponents').RuntimeTextareaOptions
  ): HTMLTextAreaElement;
}

export type RuntimeExtensionRenderer<TContext, TExtensionNode> = (
  node: TExtensionNode,
  ctx: TContext
) => Node | null;

export interface RuntimeExtensionRendererRegistry<
  TContext,
  TExtensionNode extends { kind: string }
> {
  register(
    kind: TExtensionNode['kind'],
    renderer: RuntimeExtensionRenderer<TContext, TExtensionNode>
  ): void;
  has(kind: string): boolean;
  render(node: TExtensionNode, ctx: TContext): Node | null;
}
