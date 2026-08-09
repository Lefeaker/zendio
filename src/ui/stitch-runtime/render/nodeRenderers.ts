import type {
  RuntimeExtensionRenderer,
  RuntimeExtensionRendererRegistry,
  RuntimeCoreNode,
  RuntimeElementNode,
  RuntimeNodeChild,
  RuntimeSchemaContext
} from '../contracts/schema';
import type { RuntimeSurfaceContext } from '../types/runtimeSurfaceTypes';
import {
  normalizeRuntimeNodes,
  resolveRuntimeBinding,
  resolveRuntimeValue,
  runRuntimeAction,
  runRuntimeEventAction,
  type RuntimeRendererContext
} from './actionAdapter';

export type RuntimeNodeRendererContext<
  TContext extends RuntimeSchemaContext<unknown, unknown>,
  TExtensionNode extends { kind: string } = never
> = RuntimeRendererContext<TContext> & {
  extensionRenderers?: RuntimeExtensionRendererRegistry<TContext, TExtensionNode>;
};

export type RuntimeSurfaceRendererContext = RuntimeNodeRendererContext<RuntimeSurfaceContext>;

const RUNTIME_CORE_KINDS = new Set<string>([
  'element',
  'input',
  'textarea',
  'button',
  'badge',
  'pill'
]);

type RuntimeRenderableCoreNode<TContext, TExtensionNode> =
  | RuntimeCoreNode<TContext>
  | RuntimeElementNode<TContext, TExtensionNode>;

export function createRuntimeExtensionRendererRegistry<
  TContext,
  TExtensionNode extends { kind: string }
>(): RuntimeExtensionRendererRegistry<TContext, TExtensionNode> {
  const renderers = new Map<string, RuntimeExtensionRenderer<TContext, TExtensionNode>>();
  return {
    register(kind, renderer) {
      if (renderers.has(kind)) {
        throw new Error(`Duplicate runtime extension renderer kind: ${kind}`);
      }
      renderers.set(kind, renderer);
    },
    has(kind) {
      return renderers.has(kind);
    },
    render(node, ctx) {
      const renderer = renderers.get(node.kind);
      if (!renderer) {
        throw new Error(`Unregistered runtime node kind: ${node.kind}`);
      }
      return renderer(node, ctx);
    }
  };
}

export function renderRuntimeNodeList<
  TContext extends RuntimeSchemaContext<unknown, unknown>,
  TExtensionNode extends { kind: string } = never
>(
  nodes:
    | RuntimeNodeChild<TContext, TExtensionNode>[]
    | RuntimeNodeChild<TContext, TExtensionNode>
    | ((
        ctx: TContext
      ) =>
        | RuntimeNodeChild<TContext, TExtensionNode>[]
        | RuntimeNodeChild<TContext, TExtensionNode>)
    | undefined,
  ctx: RuntimeNodeRendererContext<TContext, TExtensionNode>
): Node[] {
  return normalizeRuntimeNodes<TContext, TExtensionNode>(nodes, ctx)
    .map((node) => renderRuntimeNode<TContext, TExtensionNode>(node, ctx))
    .filter((node): node is Node => node !== null);
}

export function renderRuntimeNode<
  TContext extends RuntimeSchemaContext<unknown, unknown>,
  TExtensionNode extends { kind: string } = never
>(
  node: RuntimeNodeChild<TContext, TExtensionNode>,
  ctx: RuntimeNodeRendererContext<TContext, TExtensionNode>
): Node | null {
  const resolved = resolveRuntimeValue(node, ctx);
  if (resolved === null || resolved === undefined || resolved === false) return null;
  if (resolved instanceof Node) return resolved;
  if (typeof resolved === 'string' || typeof resolved === 'number') {
    return ctx.el('span', { text: String(resolved) });
  }
  if (!isRuntimeCoreNode<TContext, TExtensionNode>(resolved)) {
    if (ctx.extensionRenderers) {
      return ctx.extensionRenderers.render(resolved, ctx);
    }
    throw new Error(`Unregistered runtime node kind: ${resolved.kind}`);
  }
  const runtimeKind = resolved.kind;
  switch (resolved.kind) {
    case 'element': {
      const text = resolveRuntimeValue(resolved.text, ctx);
      const element = ctx.el(
        resolved.tag ?? 'div',
        {
          className: resolveRuntimeValue(resolved.className, ctx),
          text: text === undefined ? undefined : String(text),
          html: resolveRuntimeValue(resolved.html, ctx),
          src: resolveRuntimeValue(resolved.src, ctx),
          alt: resolveRuntimeValue(resolved.alt, ctx),
          href: resolveRuntimeValue(resolved.href, ctx),
          target: resolveRuntimeValue(resolved.target, ctx),
          rel: resolveRuntimeValue(resolved.rel, ctx),
          type: resolveRuntimeValue(resolved.type, ctx),
          role: resolveRuntimeValue(resolved.role, ctx),
          'aria-pressed': resolveRuntimeValue(resolved.ariaPressed, ctx),
          'aria-expanded': resolveRuntimeValue(resolved.ariaExpanded, ctx),
          'aria-haspopup': resolveRuntimeValue(resolved.ariaHaspopup, ctx),
          'aria-label': resolveRuntimeValue(resolved.ariaLabel, ctx),
          disabled: resolveRuntimeValue(resolved.disabled, ctx),
          title: resolveRuntimeValue(resolved.title, ctx),
          dataset: resolveRuntimeValue(resolved.dataset, ctx),
          style: resolveRuntimeValue(resolved.style, ctx),
          onClick: resolved.onClick
            ? (event: Event) => runRuntimeEventAction(resolved.onClick, event, ctx)
            : undefined
        },
        renderRuntimeNodeList(resolved.children, ctx)
      );
      return element;
    }
    case 'input': {
      const bound =
        resolved.value !== undefined
          ? resolveRuntimeValue(resolved.value, ctx)
          : ctx.resolveBinding
            ? ctx.resolveBinding(resolved.bind)
            : resolveRuntimeBinding(resolved.bind, ctx);
      return ctx.ui.Input(normalizeControlValue(bound), {
        mono: resolveRuntimeValue(resolved.mono, ctx),
        className: resolveRuntimeValue(resolved.className, ctx),
        type: resolveRuntimeValue(resolved.type, ctx),
        placeholder: resolveRuntimeValue(resolved.placeholder, ctx),
        disabled: resolveRuntimeValue(resolved.disabled, ctx),
        readOnly: resolveRuntimeValue(resolved.readOnly, ctx),
        min: resolveRuntimeValue(resolved.min, ctx),
        max: resolveRuntimeValue(resolved.max, ctx),
        step: resolveRuntimeValue(resolved.step, ctx),
        dataset: resolveRuntimeValue(resolved.dataset, ctx),
        onInput: resolved.onInput
          ? (event) => runRuntimeEventAction(resolved.onInput, event, ctx)
          : undefined,
        onChange: resolved.onChange
          ? (event) => runRuntimeEventAction(resolved.onChange, event, ctx)
          : undefined,
        onFocus: resolved.onFocus
          ? (event) => runRuntimeEventAction(resolved.onFocus, event, ctx)
          : undefined,
        onBlur: resolved.onBlur
          ? (event) => runRuntimeEventAction(resolved.onBlur, event, ctx)
          : undefined,
        onClick: resolved.onClick
          ? (event) => {
              event.preventDefault();
              runRuntimeEventAction(resolved.onClick, event, ctx);
            }
          : undefined,
        onKeyUp: resolved.onKeyUp
          ? (event) => runRuntimeEventAction(resolved.onKeyUp, event, ctx)
          : undefined,
        onSelect: resolved.onSelect
          ? (event) => runRuntimeEventAction(resolved.onSelect, event, ctx)
          : undefined,
        onMouseEnter: resolved.onMouseEnter
          ? (event) => runRuntimeEventAction(resolved.onMouseEnter, event, ctx)
          : undefined
      });
    }
    case 'textarea': {
      const bound =
        resolved.value !== undefined
          ? resolveRuntimeValue(resolved.value, ctx)
          : ctx.resolveBinding
            ? ctx.resolveBinding(resolved.bind)
            : resolveRuntimeBinding(resolved.bind, ctx);
      return ctx.ui.Textarea(normalizeControlValue(bound), {
        className: resolveRuntimeValue(resolved.className, ctx),
        placeholder: resolveRuntimeValue(resolved.placeholder, ctx),
        disabled: resolveRuntimeValue(resolved.disabled, ctx),
        dataset: resolveRuntimeValue(resolved.dataset, ctx),
        onInput: resolved.onInput
          ? (event) => runRuntimeEventAction(resolved.onInput, event, ctx)
          : undefined,
        onChange: resolved.onChange
          ? (event) => runRuntimeEventAction(resolved.onChange, event, ctx)
          : undefined,
        onFocus: resolved.onFocus
          ? (event) => runRuntimeEventAction(resolved.onFocus, event, ctx)
          : undefined,
        onBlur: resolved.onBlur
          ? (event) => runRuntimeEventAction(resolved.onBlur, event, ctx)
          : undefined
      });
    }
    case 'button': {
      const action = resolveRuntimeValue(resolved.action, ctx);
      const button = ctx.ui.Button(resolveRuntimeValue(resolved.label, ctx) ?? '', {
        variant: resolveRuntimeValue(resolved.variant, ctx),
        disabled: Boolean(resolveRuntimeValue(resolved.disabled, ctx)),
        onClick: action
          ? (event) => {
              event.preventDefault();
              runRuntimeAction(action, ctx, undefined, event);
            }
          : undefined
      });
      const dataset = resolveRuntimeValue(resolved.dataset, ctx);
      if (dataset) {
        Object.entries(dataset).forEach(([key, value]) => {
          button.dataset[key] = String(value);
        });
      }
      if (typeof action === 'string') button.dataset.actionId = action;
      else if (action?.id) button.dataset.actionId = action.id;
      return button;
    }
    case 'badge':
      return ctx.ui.Badge(
        resolveRuntimeValue(resolved.label, ctx) ?? '',
        resolveRuntimeValue(resolved.variant, ctx) ?? ''
      );
    case 'pill':
      return ctx.ui.Pill(resolveRuntimeValue(resolved.label, ctx) ?? '');
    default:
      throw new Error(`Unregistered runtime node kind: ${runtimeKind}`);
  }
}

export function renderRuntimeContent<
  TContext extends RuntimeSchemaContext<unknown, unknown>,
  TExtensionNode extends { kind: string } = never
>(
  content:
    | RuntimeNodeChild<TContext, TExtensionNode>[]
    | RuntimeNodeChild<TContext, TExtensionNode>
    | ((
        ctx: TContext
      ) =>
        | RuntimeNodeChild<TContext, TExtensionNode>[]
        | RuntimeNodeChild<TContext, TExtensionNode>)
    | undefined,
  ctx: RuntimeNodeRendererContext<TContext, TExtensionNode>,
  className?: string
): Node {
  const nodes = renderRuntimeNodeList(content, ctx);
  if (!nodes.length) return ctx.el('div');
  if (nodes.length === 1 && !className) return nodes[0];
  return ctx.el('div', { className: className ?? 'stack' }, nodes);
}

function normalizeControlValue(value: unknown): string | number {
  return typeof value === 'string' || typeof value === 'number' ? value : '';
}

function isRuntimeCoreNode<TContext, TExtensionNode extends { kind: string }>(
  node: RuntimeRenderableCoreNode<TContext, TExtensionNode> | TExtensionNode
): node is RuntimeRenderableCoreNode<TContext, TExtensionNode> {
  return RUNTIME_CORE_KINDS.has(node.kind);
}
