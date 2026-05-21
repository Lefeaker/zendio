import { resolveSchemaValue } from './binding';
import type { WidgetMountContract, WidgetRuntime, WidgetSchema } from './contracts';
import { el } from './dom';
import { asString, joinClassNames, type SchemaRendererRuntime } from './rendererContext';

export interface RendererWidgetLifecycle<State, AppData> {
  collectWidgetState: () => unknown[];
  dispose: () => void;
  renderWidget: (node: WidgetSchema<State, AppData>) => HTMLElement;
}

export function createRendererWidgetLifecycle<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>
): RendererWidgetLifecycle<State, AppData> {
  const widgetInstances = new Set<WidgetMountContract<unknown, State, AppData>>();

  function collectWidgetState(): unknown[] {
    const collected: unknown[] = [];
    widgetInstances.forEach((widget) => {
      if (typeof widget.collect !== 'function') {
        return;
      }
      try {
        const value = widget.collect();
        if (value !== undefined) {
          collected.push(value);
        }
      } catch (error) {
        runtime.reportError?.('collect', error);
      }
    });
    return collected;
  }

  function dispose(): void {
    widgetInstances.forEach((widget) => {
      try {
        widget.destroy();
      } catch (error) {
        console.warn('[SchemaRenderer] Failed to destroy widget instance:', error);
      }
    });
    widgetInstances.clear();
  }

  function renderWidget(node: WidgetSchema<State, AppData>): HTMLElement {
    const ctx = runtime.getContext();
    const host = el('div', {
      className: joinClassNames([
        'schema-widget-host',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    });
    const factory = runtime.getWidgetFactory(node.widgetType);
    if (!factory) {
      host.append(
        el('div', {
          className: 'schema-widget-missing',
          text: `[Missing widget] ${node.widgetType}`
        })
      );
      return host;
    }

    const widget = factory();
    const widgetRuntime: WidgetRuntime<State, AppData> = {
      getContext: runtime.getContext,
      dispatch: runtime.dispatch,
      requestRerender: runtime.requestRerender,
      mutate: runtime.mutate,
      ...(runtime.notifyDirty ? { notifyDirty: runtime.notifyDirty } : {}),
      ...(runtime.reportError ? { reportError: runtime.reportError } : {})
    };
    const resolvedProps = resolveSchemaValue(node.props, ctx);
    void widget.mount(host, resolvedProps, widgetRuntime);
    widgetInstances.add(widget);
    return host;
  }

  return {
    collectWidgetState,
    dispose,
    renderWidget
  };
}
