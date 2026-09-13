import type {
  ActionDescriptor as SharedActionDescriptor,
  StateBinding as SharedStateBinding
} from '@options/schema-runtime';
import type { Messages } from '@i18n';
import type { SchemaTranslator } from '../schema/i18n';
import type {
  HeroData,
  PreviewContent,
  SegmentedOption,
  SelectOption,
  UsageStat
} from './contentTypes';
import type { PreviewStoreState } from './storeTypes';
import type { SurfaceAction } from '@ui/stitch-runtime';
import type {
  RuntimeActionDescriptor,
  RuntimeBaseNode,
  RuntimeBadgeNode,
  RuntimeButtonNode,
  RuntimeDynamicValue,
  RuntimeElementNode,
  RuntimeInputNode,
  RuntimeNodeChild,
  RuntimeNodeSchema,
  RuntimePillNode,
  RuntimePreviewStyle,
  RuntimeSurfaceContext,
  RuntimeStateBinding,
  RuntimeTextareaNode,
  RuntimeViewSchema
} from '@ui/stitch-runtime';

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

export type DynamicValue<T> = RuntimeDynamicValue<T, SchemaContext>;

export interface ActionDescriptor
  extends
    Omit<SharedActionDescriptor, 'args'>,
    Omit<RuntimeActionDescriptor<SchemaContext>, 'args'> {
  args?: DynamicValue<unknown[]>;
  transform?: (value: unknown, ctx: SchemaContext, event?: Event) => unknown;
}

export type ActionReference = string | ActionDescriptor;

export interface StateBinding
  extends Omit<SharedStateBinding, 'source'>, Omit<RuntimeStateBinding<SchemaContext>, 'source'> {
  source?: SharedStateBinding['source'] | 'context';
}

export type PreviewStyle = RuntimePreviewStyle;

export type NodeChild = RuntimeNodeChild<SchemaContext, OptionsExtensionNode>;

export type BaseNode = RuntimeBaseNode<SchemaContext>;

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

export type InputNode = RuntimeInputNode<SchemaContext>;
export type TextareaNode = RuntimeTextareaNode<SchemaContext>;

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

export type ButtonNode = RuntimeButtonNode<SchemaContext>;
export type BadgeNode = RuntimeBadgeNode<SchemaContext>;
export type PillNode = RuntimePillNode<SchemaContext>;

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
  items: DynamicValue<SegmentedOption[]>;
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

export type ElementNode = RuntimeElementNode<SchemaContext, OptionsExtensionNode>;

export type OptionsExtensionNode =
  | GroupNode
  | CardNode
  | RowsNode
  | RowNode
  | FieldNode
  | SelectNode
  | SwitchNode
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
  | WidgetNode;

export type NodeSchema = RuntimeNodeSchema<SchemaContext, OptionsExtensionNode>;

export interface OptionsViewSchema {
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

export type ViewSchema = OptionsViewSchema | RuntimeViewSchema<RuntimeSurfaceContext>;

export type ResourceSchema = {
  openMode: 'modal' | 'page';
  href?: string;
  createView: (ctx: SchemaContext) => ViewSchema;
};

export type SettingsSchema = { createView: (ctx: SchemaContext) => ViewSchema };
