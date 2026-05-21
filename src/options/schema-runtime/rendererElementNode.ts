import { resolveSchemaValue } from './binding';
import type { ElementNode } from './contracts';
import { el } from './dom';
import { asString, toArray, type RenderNode, type SchemaRendererRuntime } from './rendererContext';

export function renderElement<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  node: ElementNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  const attrs = node.attrs ?? {};
  const props: Record<string, unknown> = {
    className: asString(resolveSchemaValue(node.className, ctx) ?? '')
  };
  Object.entries(attrs).forEach(([key, value]) => {
    props[key] = asString(resolveSchemaValue(value, ctx));
  });
  if (node.text) {
    props.text = asString(resolveSchemaValue(node.text, ctx));
  }
  if (node.html) {
    props.html = asString(resolveSchemaValue(node.html, ctx));
  }
  return el(
    node.tag,
    props,
    toArray(node.children).map((child) => renderNode(child))
  );
}
