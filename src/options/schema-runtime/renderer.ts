import { createRendererNodeDispatcher } from './rendererNodeDispatch';
import { renderView as renderSchemaView } from './rendererView';
import { createRendererWidgetLifecycle } from './rendererWidgetLifecycle';
import type {
  SchemaRenderer,
  SchemaRendererExtensions,
  SchemaRendererRuntime
} from './rendererContext';

export type {
  SchemaRenderer,
  SchemaRendererExtensions,
  SchemaRendererRuntime
} from './rendererContext';

export function createSchemaRenderer<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  extensions: SchemaRendererExtensions = {}
): SchemaRenderer<State, AppData> {
  const widgetLifecycle = createRendererWidgetLifecycle(runtime);
  const renderNode = createRendererNodeDispatcher(runtime, widgetLifecycle);

  return {
    collectWidgetState: widgetLifecycle.collectWidgetState,
    renderView(view) {
      return renderSchemaView(runtime, extensions, renderNode, view);
    },
    dispose: widgetLifecycle.dispose
  };
}
