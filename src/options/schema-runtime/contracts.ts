export type SchemaSource = 'state' | 'appData';

export interface SchemaContext<State, AppData> {
  state: State;
  appData: AppData;
}

export interface StateBinding {
  source?: SchemaSource;
  path: string;
  fallback?: unknown;
}

export type SchemaValue<T, State, AppData> =
  | T
  | StateBinding
  | ((ctx: SchemaContext<State, AppData>) => T);

export interface ActionDescriptor {
  id: string;
  args?: unknown[];
  valueFrom?: 'target.value' | 'target.checked' | 'dataset.value';
}

export interface HeroSchema<State, AppData> {
  title: SchemaValue<string, State, AppData>;
  description?: SchemaValue<string, State, AppData>;
  pills?: SchemaValue<string[], State, AppData>;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface TableCellSchema<State, AppData> {
  text?: SchemaValue<string, State, AppData>;
  node?: NodeSchema<State, AppData>;
  className?: SchemaValue<string, State, AppData>;
}

export interface TableRowSchema<State, AppData> {
  cells: Array<TableCellSchema<State, AppData> | NodeSchema<State, AppData>>;
  className?: SchemaValue<string, State, AppData>;
}

export interface BaseNode<State, AppData> {
  kind: string;
  id?: string;
  className?: SchemaValue<string, State, AppData>;
}

export interface GroupNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'group';
  title: SchemaValue<string, State, AppData>;
  children: NodeSchema<State, AppData>[];
}

export interface CardNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'card';
  title?: SchemaValue<string, State, AppData>;
  description?: SchemaValue<string, State, AppData>;
  actions?: NodeSchema<State, AppData>[];
  children?: NodeSchema<State, AppData>[];
}

export interface StackNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'stack';
  children: NodeSchema<State, AppData>[];
}

export interface RowNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'row';
  title: SchemaValue<string, State, AppData>;
  description?: SchemaValue<string, State, AppData>;
  control: NodeSchema<State, AppData> | NodeSchema<State, AppData>[];
}

export interface FieldNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'field';
  label: SchemaValue<string, State, AppData>;
  control: NodeSchema<State, AppData> | NodeSchema<State, AppData>[];
}

export interface InputNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'input' | 'textarea';
  bind?: StateBinding;
  value?: SchemaValue<string, State, AppData>;
  placeholder?: SchemaValue<string, State, AppData>;
  type?: SchemaValue<string, State, AppData>;
  disabled?: SchemaValue<boolean, State, AppData>;
  action?: ActionDescriptor;
}

export interface SelectNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'select';
  bind?: StateBinding;
  options: SchemaValue<SelectOption[], State, AppData>;
  value?: SchemaValue<string, State, AppData>;
  disabled?: SchemaValue<boolean, State, AppData>;
  action?: ActionDescriptor;
}

export interface SwitchNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'switch';
  bind?: StateBinding;
  checked?: SchemaValue<boolean, State, AppData>;
  stateText?: SchemaValue<string, State, AppData>;
  disabled?: SchemaValue<boolean, State, AppData>;
  action?: ActionDescriptor;
}

export interface ButtonNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'button';
  label: SchemaValue<string, State, AppData>;
  variant?: SchemaValue<'primary' | 'secondary' | 'ghost' | 'danger', State, AppData>;
  action?: ActionDescriptor;
}

export interface NoticeNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'notice';
  title: SchemaValue<string, State, AppData>;
  body?: SchemaValue<string, State, AppData>;
  variant?: SchemaValue<'info' | 'warning' | 'success' | 'danger', State, AppData>;
}

export interface TableNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'table';
  columns: SchemaValue<string[], State, AppData>;
  rows: SchemaValue<TableRowSchema<State, AppData>[], State, AppData>;
}

export interface TokenRowNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'tokenRow';
  tokens: SchemaValue<string[], State, AppData>;
  action?: ActionDescriptor;
}

export interface ElementNode<State, AppData> extends BaseNode<State, AppData> {
  kind: 'element';
  tag: keyof HTMLElementTagNameMap;
  text?: SchemaValue<string, State, AppData>;
  html?: SchemaValue<string, State, AppData>;
  attrs?: Record<string, SchemaValue<string, State, AppData>>;
  children?: NodeSchema<State, AppData>[];
}

export interface WidgetSchema<State, AppData, Props = unknown> extends BaseNode<State, AppData> {
  kind: 'widget';
  widgetType: string;
  props?: SchemaValue<Props, State, AppData>;
  bind?: StateBinding;
  actions?: ActionDescriptor[];
}

export type NodeSchema<State, AppData> =
  | GroupNode<State, AppData>
  | CardNode<State, AppData>
  | StackNode<State, AppData>
  | RowNode<State, AppData>
  | FieldNode<State, AppData>
  | InputNode<State, AppData>
  | SelectNode<State, AppData>
  | SwitchNode<State, AppData>
  | ButtonNode<State, AppData>
  | NoticeNode<State, AppData>
  | TableNode<State, AppData>
  | TokenRowNode<State, AppData>
  | WidgetSchema<State, AppData>
  | ElementNode<State, AppData>
  | string
  | number
  | null
  | undefined
  | false;

export interface ViewSchema<State, AppData> {
  id: string;
  kind: 'page' | 'modal' | 'standalone-page';
  title?: SchemaValue<string, State, AppData>;
  description?: SchemaValue<string, State, AppData>;
  hero?: HeroSchema<State, AppData>;
  size?: 'medium' | 'large';
  children?: NodeSchema<State, AppData>[];
}

export interface SettingsSchema<State, AppData> {
  id: string;
  navLabel: string;
  navHint: string;
  createView: (ctx: SchemaContext<State, AppData>) => ViewSchema<State, AppData>;
}

export interface ResourceSchema<State, AppData> {
  id: string;
  label: string;
  hint: string;
  openMode: 'modal' | 'page';
  href?: string;
  createView: (ctx: SchemaContext<State, AppData>) => ViewSchema<State, AppData>;
}

export interface WidgetRuntime<State, AppData> {
  getContext: () => SchemaContext<State, AppData>;
  dispatch: (action: ActionDescriptor | string, payload?: unknown) => void;
  requestRerender: () => void;
  mutate: (mutator: (state: State) => void, options?: { silent?: boolean }) => void;
  notifyDirty?: (keys?: string[], meta?: { invalid?: boolean }) => void;
  reportError?: (scope: string, error: unknown) => void;
}

export interface WidgetMountContract<Props = unknown, State = unknown, AppData = unknown> {
  mount: (
    container: HTMLElement,
    props: Props,
    runtime?: WidgetRuntime<State, AppData>
  ) => void | Promise<void>;
  update: (props: Props, runtime?: WidgetRuntime<State, AppData>) => void | Promise<void>;
  destroy: () => void;
  collect?: () => unknown;
  applySnapshot?: (snapshot: unknown) => void | Promise<void>;
}

export type WidgetFactory<State, AppData> = () => WidgetMountContract<unknown, State, AppData>;
