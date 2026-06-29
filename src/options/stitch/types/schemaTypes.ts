import type {
  ActionDescriptor as SharedActionDescriptor,
  StateBinding as SharedStateBinding
} from '@options/schema-runtime';
import type { Messages } from '@i18n';
import type { SchemaTranslator } from '../schema/i18n';
import type { HeroData, PreviewContent, SelectOption, UsageStat } from './contentTypes';
import type { PreviewStoreState } from './storeTypes';
import type { SurfaceAction } from './surfaceTypes';

export type SchemaBrowserTarget = 'chrome' | 'firefox';

export interface SchemaContext {
  appData: PreviewContent;
  state: PreviewStoreState;
  capabilities?: {
    analyticsDebugMode?: boolean;
  };
  browserTarget?: SchemaBrowserTarget;
  language?: string;
  messages?: Messages | null;
  t?: SchemaTranslator;
}

export type DynamicValue<T> = T | ((ctx: SchemaContext) => T);

export interface ActionDescriptor extends Omit<SharedActionDescriptor, 'args'> {
  args?: DynamicValue<unknown[]>;
  transform?: (value: unknown, ctx: SchemaContext, event?: Event) => unknown;
}

export type ActionReference = string | ActionDescriptor;

export interface StateBinding extends Omit<SharedStateBinding, 'source'> {
  source?: SharedStateBinding['source'] | 'context';
}

export type PreviewStyle = Partial<CSSStyleDeclaration> & Record<`--${string}`, string | number>;

export type NodeChild =
  | NodeSchema
  | null
  | false
  | undefined
  | ((ctx: SchemaContext) => NodeSchema | null | false | undefined);

export interface BaseNode {
  kind: string;
  className?: DynamicValue<string>;
  dataset?: DynamicValue<Record<string, string | number | boolean>>;
  style?: DynamicValue<PreviewStyle>;
}

export interface GroupNode extends BaseNode {
  kind: 'group';
  title: DynamicValue<string>;
  contentClassName?: DynamicValue<string>;
  children?: DynamicValue<NodeChild[]>;
}

export interface CardNode extends BaseNode {
  kind: 'card';
  title?: DynamicValue<string>;
  description?: DynamicValue<string>;
  actions?: DynamicValue<NodeChild[]>;
  body?: DynamicValue<NodeChild[]>;
  bodyClassName?: DynamicValue<string>;
  extraClass?: DynamicValue<string>;
  children?: DynamicValue<NodeChild[]>;
}

export interface RowsNode extends BaseNode {
  kind: 'rows';
  items?: DynamicValue<NodeChild[]>;
}

export interface RowNode extends BaseNode {
  kind: 'row';
  title: DynamicValue<string>;
  description?: DynamicValue<string>;
  control: NodeChild | NodeChild[];
}

export interface FieldNode extends BaseNode {
  kind: 'field';
  label: DynamicValue<string>;
  control: NodeChild | NodeChild[];
}

export interface InputNode extends BaseNode {
  kind: 'input';
  bind?: string | StateBinding;
  value?: DynamicValue<string | number>;
  type?: DynamicValue<string>;
  placeholder?: DynamicValue<string>;
  disabled?: DynamicValue<boolean>;
  readOnly?: DynamicValue<boolean>;
  mono?: DynamicValue<boolean>;
  min?: DynamicValue<string | number>;
  max?: DynamicValue<string | number>;
  step?: DynamicValue<string | number>;
  onInput?: DynamicValue<ActionDescriptor>;
  onChange?: DynamicValue<ActionDescriptor>;
  onFocus?: DynamicValue<ActionDescriptor>;
  onBlur?: DynamicValue<ActionDescriptor>;
  onClick?: DynamicValue<ActionDescriptor>;
  onKeyUp?: DynamicValue<ActionDescriptor>;
  onSelect?: DynamicValue<ActionDescriptor>;
  onMouseEnter?: DynamicValue<ActionDescriptor>;
}

export interface TextareaNode extends BaseNode {
  kind: 'textarea';
  bind?: string | StateBinding;
  value?: DynamicValue<string | number>;
  placeholder?: DynamicValue<string>;
  disabled?: DynamicValue<boolean>;
  onInput?: DynamicValue<ActionDescriptor>;
  onChange?: DynamicValue<ActionDescriptor>;
  onFocus?: DynamicValue<ActionDescriptor>;
  onBlur?: DynamicValue<ActionDescriptor>;
}

export interface SelectNode extends BaseNode {
  kind: 'select';
  bind?: string | StateBinding;
  value?: DynamicValue<string | number>;
  options?: DynamicValue<SelectOption[]>;
  disabled?: DynamicValue<boolean>;
  onChange?: DynamicValue<ActionDescriptor>;
}

export interface SwitchNode extends BaseNode {
  kind: 'switch';
  bind?: string | StateBinding;
  checked?: DynamicValue<boolean>;
  disabled?: DynamicValue<boolean>;
  compact?: DynamicValue<boolean>;
  stateText?: DynamicValue<string>;
  onClick?: DynamicValue<ActionDescriptor>;
  onChange?: DynamicValue<ActionDescriptor>;
}

export type ButtonVariant = SurfaceAction['variant'];

export interface ButtonNode extends BaseNode {
  kind: 'button';
  label: DynamicValue<string>;
  variant?: DynamicValue<ButtonVariant>;
  action?: DynamicValue<ActionReference>;
  disabled?: DynamicValue<boolean>;
}

export interface BadgeNode extends BaseNode {
  kind: 'badge';
  label: DynamicValue<string>;
  variant?: DynamicValue<string>;
}

export interface PillNode extends BaseNode {
  kind: 'pill';
  label: DynamicValue<string>;
}

export interface StatsGridNode extends BaseNode {
  kind: 'statsGrid';
  items: DynamicValue<UsageStat[]>;
}

export interface UsageChartNode extends BaseNode {
  kind: 'usageChart';
}

export interface NoticeNode extends BaseNode {
  kind: 'notice';
  title: DynamicValue<string>;
  body?: DynamicValue<string | NodeChild | NodeChild[]>;
  variant?: DynamicValue<'info' | 'warning' | 'danger' | 'success'>;
}

export interface TableCellSchema {
  props?: DynamicValue<Record<string, string | number | boolean>>;
  node?: NodeChild;
  text?: DynamicValue<string | number>;
  html?: DynamicValue<string>;
}

export interface TableRowSchema {
  rowProps?: DynamicValue<Record<string, string | number | boolean>>;
  cells: Array<TableCellSchema | NodeChild | string | number>;
}

export interface TableNode extends BaseNode {
  kind: 'table';
  columns: DynamicValue<string[]>;
  rows: DynamicValue<TableRowSchema[]>;
  rowClassName?: DynamicValue<string>;
}

export interface TokenRowNode extends BaseNode {
  kind: 'tokenRow';
  tokens: DynamicValue<string[]>;
  action?: DynamicValue<ActionReference>;
  activeToken?: DynamicValue<string>;
}

export interface SegmentedNavNode extends BaseNode {
  kind: 'segmentedNav';
  items: DynamicValue<SelectOption[]>;
  bind?: string | StateBinding;
  value?: DynamicValue<string>;
  action: DynamicValue<ActionReference>;
}

export interface DetailsNode extends BaseNode {
  kind: 'details';
  summary: DynamicValue<string>;
  open?: DynamicValue<boolean>;
  bodyClassName?: DynamicValue<string>;
  children?: DynamicValue<NodeChild[]>;
}

export interface StackNode extends BaseNode {
  kind: 'stack';
  tag?: keyof HTMLElementTagNameMap;
  children?: DynamicValue<NodeChild[]>;
}

export type GridColumns = 2 | 3 | 4 | '2' | '3' | '4' | 'mini';

export interface GridNode extends BaseNode {
  kind: 'grid';
  columns?: DynamicValue<GridColumns>;
  children?: DynamicValue<NodeChild[]>;
}

export interface MiniCardNode extends BaseNode {
  kind: 'miniCard';
  title: DynamicValue<string>;
  content?: DynamicValue<NodeChild | NodeChild[]>;
  children?: DynamicValue<NodeChild[]>;
}

export interface ChipItem {
  value?: string;
  label?: string;
  pressed?: boolean;
  readonly?: boolean;
}

export interface ChipsNode extends BaseNode {
  kind: 'chips';
  items: DynamicValue<Array<string | ChipItem>>;
  readonly?: DynamicValue<boolean>;
  action?: DynamicValue<ActionReference>;
}

export interface ListNode extends BaseNode {
  kind: 'list';
  items: DynamicValue<Array<string | NodeChild | NodeChild[]>>;
  ordered?: DynamicValue<boolean>;
  compact?: DynamicValue<boolean>;
}

export interface ResourceCardNode extends BaseNode {
  kind: 'resourceCard';
  title: DynamicValue<string>;
  subtitle?: DynamicValue<string>;
  detail?: DynamicValue<string>;
  note?: DynamicValue<string>;
  href?: DynamicValue<string>;
  icon?: DynamicValue<string>;
  image?: DynamicValue<string>;
  imageAlt?: DynamicValue<string>;
  imagePresentation?: DynamicValue<'inline' | 'modal'>;
}

export interface HighlightExampleNode extends BaseNode {
  kind: 'highlightExample';
}

export interface WidgetNode extends BaseNode {
  kind: 'widget';
  widgetType: DynamicValue<string>;
  props?: DynamicValue<Record<string, unknown>>;
}

export interface ElementNode extends BaseNode {
  kind: 'element';
  tag?: keyof HTMLElementTagNameMap;
  text?: DynamicValue<string | number>;
  html?: DynamicValue<string>;
  src?: DynamicValue<string>;
  alt?: DynamicValue<string>;
  href?: DynamicValue<string>;
  target?: DynamicValue<string>;
  rel?: DynamicValue<string>;
  type?: DynamicValue<string>;
  role?: DynamicValue<string>;
  ariaPressed?: DynamicValue<string>;
  ariaExpanded?: DynamicValue<string>;
  ariaHaspopup?: DynamicValue<string>;
  ariaLabel?: DynamicValue<string>;
  disabled?: DynamicValue<boolean>;
  title?: DynamicValue<string>;
  onClick?: DynamicValue<ActionDescriptor>;
  children?: DynamicValue<NodeChild[]>;
}

export type NodeSchema =
  | GroupNode
  | CardNode
  | RowsNode
  | RowNode
  | FieldNode
  | InputNode
  | TextareaNode
  | SelectNode
  | SwitchNode
  | ButtonNode
  | BadgeNode
  | PillNode
  | StatsGridNode
  | UsageChartNode
  | NoticeNode
  | TableNode
  | TokenRowNode
  | SegmentedNavNode
  | DetailsNode
  | StackNode
  | GridNode
  | MiniCardNode
  | ChipsNode
  | ListNode
  | ResourceCardNode
  | HighlightExampleNode
  | WidgetNode
  | ElementNode
  | string
  | number
  | null
  | undefined
  | false;

export interface ViewSchema {
  id: string;
  kind: 'page' | 'modal' | 'standalone-page';
  className?: string;
  dataset?: Record<string, string | number | boolean>;
  title?: string;
  description?: string;
  hero?: HeroData;
  size?: 'medium' | 'large';
  surfacePlacement?: 'dialog' | 'side-right' | 'floating-bottom-right';
  surfaceSkin?: 'clipper' | 'session' | 'task-success';
  children?: NodeSchema[];
}

export type ResourceSchema = {
  openMode: 'modal' | 'page';
  href?: string;
  createView: (ctx: SchemaContext) => ViewSchema;
};

export type SettingsSchema = { createView: (ctx: SchemaContext) => ViewSchema };
