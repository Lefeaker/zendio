import type {
  ActionDescriptor as SharedActionDescriptor,
  StateBinding as SharedStateBinding
} from '@options/schema-runtime';
import type { Messages } from '@i18n';
import type { SchemaTranslator } from './schema/i18n';
import type { PreviewVideoStoreState } from './videoStateTypes';
export interface HeroData {
  title: string;
  description: string;
  pills: string[];
  icon?: string;
}

export interface NavItem {
  id: string;
  label: string;
  hint: string;
  icon?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface UsageStat {
  label: string;
  value: number;
}

export interface UsagePoint {
  label: string;
  value: number;
}

export interface VaultRecord {
  id?: string;
  name: string;
  localFolderId?: string;
  localFolderName?: string;
  https: string;
  http: string;
  key: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface RoutingRule {
  type: string;
  pattern: string;
  target: string;
  priority: number | '';
  enabled: boolean;
}

export type DomainMapping = [string, string, string];

export interface YamlRowGroup {
  group: string;
  groupId: string;
  rows: Array<[string, string, Record<string, string>, string, string]>;
}

export interface YamlDomainRule {
  types: string[];
  typeLabel: string;
  domain: string;
  rows: Array<[string, string, string, string]>;
}

export type PresetEntry = [string, string];

export interface ResourceStep {
  number?: string;
  title: string;
  description: string;
  bullets?: string[];
}

export interface SupportChannel {
  title: string;
  subtitle?: string;
  detail?: string;
  href?: string;
  note?: string;
  icon?: string;
}

export interface ContactEntry {
  title: string;
  subtitle?: string;
  detail?: string;
  href?: string;
  note?: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  bullets: string[];
  notes?: Array<{ title: string; items: string[] }>;
}

export interface SurfaceAction {
  id?: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger';
}

export interface ExportDestinationSurfaceOption {
  id: string;
  kind: 'vault' | 'downloads';
  label: string;
  path: string;
  selected: boolean;
}

export interface ExportDestinationSurfacePreview {
  id: string;
  kind: 'vault' | 'downloads';
  label: string;
  path: string;
  hasConfiguredVault: boolean;
  setupUrl?: string;
  options: ExportDestinationSurfaceOption[];
}

export interface ClipperSurfaceLabels {
  title: string;
  selectionPreview: string;
  commentLabel: string;
}

export interface ClipperSurfaceSource {
  title: string;
  host: string;
  initials: string;
  verifiedLabel: string;
}

export interface RuntimeSessionLabels {
  title: string;
  subtitle: string;
  exitTriggerLabel: string;
  exitTitle: string;
  exitCancelLabel: string;
  exitConfirmLabel: string;
  notePlaceholder: string;
  fragmentNotePlaceholder?: string;
  saveLabel: string;
  deleteLabel: string;
}

export interface ReaderSurfaceHighlight {
  id: string;
  index: number;
  excerpt: string;
  fullText: string;
  commentPreview?: string;
  comment?: string;
  draft?: string;
  timestamp: string;
  editing?: boolean;
}

export interface VideoSurfaceCapture {
  id: string;
  index: number;
  kind: 'timestamp' | 'fragment';
  markerLabel?: string;
  summary: string;
  fullText?: string;
  commentPreview?: string;
  comment?: string;
  draft?: string;
  meta: string;
  hasScreenshot?: boolean;
  editing?: boolean;
}

export type ToastPreview = { title: string; detail: string; actions?: string[] };

export interface PreviewSurfaces {
  clipper: {
    hero: HeroData;
    iconUrl: string;
    labels: ClipperSurfaceLabels;
    source: ClipperSurfaceSource;
    destination?: ExportDestinationSurfacePreview;
    selectedText: string;
    commentPlaceholder: string;
    helper: string;
    shortcuts: string[];
    actions: SurfaceAction[];
  };
  reader: {
    hero: HeroData;
    iconUrl: string;
    labels: RuntimeSessionLabels;
    hint: string;
    counter: string;
    overlaySummary: string;
    destination?: ExportDestinationSurfacePreview;
    highlights: ReaderSurfaceHighlight[];
    actions: SurfaceAction[];
  };
  video: {
    hero: HeroData;
    labels: RuntimeSessionLabels & { addLabel: string; emptyCapturePlaceholder: string };
    status: string;
    hint: string;
    counter: string;
    destination?: ExportDestinationSurfacePreview;
    captures: VideoSurfaceCapture[];
    actions: SurfaceAction[];
  };
  videoFloatingPrompt: {
    label: string;
    shortcut: string;
    dismissLabel: string;
  };
  taskSuccess: {
    hero: HeroData;
    status: string;
    statusMessage: string;
    statusDetail?: string;
    progress?: {
      value: number;
      variant: 'progress' | 'success' | 'failure' | 'warning';
    };
    feedbackLabel: string;
    likeLabel: string;
    dislikeLabel: string;
    dismissLabel: string;
    likeToast: ToastPreview;
    dislikeToast: ToastPreview;
  };
}

export interface PreviewResources {
  privacyPolicy: {
    hero: HeroData;
    sections: Array<{ title: string; body: string; bullets?: string[] }>;
  };
  dataUsage: {
    hero: HeroData;
    sections: Array<{ title: string; body: string; bullets?: string[] }>;
  };
  onboarding: {
    hero: HeroData;
    steps: ResourceStep[];
  };
  pluginSetup: {
    hero: HeroData;
    ports: Array<[string, string]>;
    steps: Array<{ title: string; body: string }>;
    checks: string[];
  };
  support: {
    hero: HeroData;
    channels: SupportChannel[];
    scope: string[];
    response: string[];
  };
  suggestions: {
    hero: HeroData;
    channels: SupportChannel[];
  };
  contact: {
    hero: HeroData;
    entries: ContactEntry[];
    note: string;
  };
  changelog: {
    hero: HeroData;
    entries: ChangelogEntry[];
  };
}

export interface PreviewContent {
  brand: {
    title: string;
    subtitle: string;
    logo: string;
  };
  rendererLabels: {
    resourcePendingBadge: string;
    resourceOpenAction: string;
    highlightExamplePrefix: string;
    highlightExampleText: string;
    highlightExampleSuffix: string;
  };
  sidebarLinks: NavItem[];
  surfaceLinks: NavItem[];
  nav: NavItem[];
  overview: {
    hero: HeroData;
    stats: UsageStat[];
    history: UsagePoint[];
  };
  languageOptions: SelectOption[];
  privacyCollected: string[];
  privacyExcluded: string[];
  storage: {
    hero: HeroData;
    routingTypeOptions: SelectOption[];
    vaults: VaultRecord[];
    routingRules: RoutingRule[];
    rootDir?: string;
    connectionNotice?: {
      title: string;
      body: string;
      html?: string;
      variant: 'info' | 'warning' | 'danger' | 'success';
    };
  };
  captureSources: {
    hero: HeroData;
    aiPlatforms: string[];
  };
  captureBehavior: {
    hero: HeroData;
  };
  output: {
    hero: HeroData;
    templateDefaults: Record<string, string>;
    tokens: string[];
    domainMappings: DomainMapping[];
    yamlFilters: SelectOption[];
    yamlRows: YamlRowGroup[];
    yamlDomainRules: YamlDomainRule[];
    yamlPreview: string;
    presets: PresetEntry[];
  };
  experimental: {
    hero: HeroData;
    providerOptions: SelectOption[];
    aiDefaults: {
      provider: string;
      model: string;
      apiUrl: string;
      apiKey: string;
    };
    subtitleLanguages: SelectOption[];
  };
  resources: PreviewResources;
  surfaces: PreviewSurfaces;
  maintenanceLog: string;
}

export interface PreviewStoreState extends PreviewVideoStoreState {
  activePanel: string;
  activeResource: string | null;
  previewTheme: 'dark' | 'light';
  interfaceThemePreference?: 'dark' | 'light' | 'system';
  previewLanguage: string;
  yamlFilter: string;
  readingPathMode: string;
  pageSummaryEnabled: boolean;
  readingOverlaySummaryEnabled: boolean;
  subtitleTranslationEnabled: boolean;
  subtitleTargetLanguage: string;
  experimentalAiConfig: {
    provider: string;
    model: string;
    apiUrl: string;
    apiKey: string;
  };
  highlightTheme: string;
  readingExportMode?: string;
  aiUserName?: string;
  privacyAnalytics?: boolean;
  privacyErrorReporting?: boolean;
  privacyDebugMode?: boolean;
  privacyStatus?: string;
  classifierEnabled?: boolean;
  classifierProvider?: string;
  classifierEndpoint?: string;
  classifierModel?: string;
  classifierApiKey?: string;
  classifierTaxonomyText?: string;
  fragmentUseFootnoteFormat?: boolean;
  fragmentCaptureContext?: boolean;
  fragmentContextLength?: number;
  fragmentContextMode?: string;
  fragmentKeyboardShortcutsEnabled?: boolean;
  fragmentModifierEnabled: boolean;
  modifierKeys: string[];
  activeLocalFolderVaultIndex?: number | null;
  yamlFieldStates: Record<string, string>;
  routingRules: RoutingRule[];
  templateValues: Record<string, string>;
  activeTemplateField: string;
  pendingTemplateFocus: string | null;
  pendingTemplateSelection: { start: number; end: number } | null;
  maintenanceLog?: string;
}

export interface SchemaContext {
  appData: PreviewContent;
  state: PreviewStoreState;
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
