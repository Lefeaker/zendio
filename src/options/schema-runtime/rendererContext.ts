import type {
  ActionDescriptor,
  NodeSchema,
  SchemaContext,
  ViewSchema,
  WidgetFactory
} from './contracts';

export interface SchemaRendererRuntime<State, AppData> {
  getContext: () => SchemaContext<State, AppData>;
  dispatch: (action: ActionDescriptor | string, payload?: unknown) => void;
  mutate: (mutator: (state: State) => void, options?: { silent?: boolean }) => void;
  requestRerender: () => void;
  getWidgetFactory: (widgetType: string) => WidgetFactory<State, AppData> | null;
  notifyDirty?: (keys?: string[], meta?: { invalid?: boolean }) => void;
  reportError?: (scope: string, error: unknown) => void;
}

export interface SchemaRendererExtensions {
  renderView?: (view: unknown) => HTMLElement | null | undefined;
}

export interface SchemaRenderer<State, AppData> {
  renderView: (view: ViewSchema<State, AppData>) => HTMLElement;
  collectWidgetState: () => unknown[];
  dispose: () => void;
}

export type RenderNode<State, AppData> = (node: NodeSchema<State, AppData>) => HTMLElement;

export function toArray<State, AppData>(
  value: NodeSchema<State, AppData>[] | NodeSchema<State, AppData> | undefined
): NodeSchema<State, AppData>[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function joinClassNames(parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}

export function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

export function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
