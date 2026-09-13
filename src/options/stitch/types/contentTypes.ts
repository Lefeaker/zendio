import type {
  ChangelogEntry,
  ContactEntry,
  HeroData,
  RuntimeSurfaceContent,
  SupportChannel
} from '@ui/stitch-runtime';
export type { HeroData } from '@ui/stitch-runtime';

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

export interface SegmentedOption extends SelectOption {
  swatchClassName?: string;
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

type OptionsTaskSuccessSurface = Omit<
  RuntimeSurfaceContent['taskSuccess'],
  'supportChannels' | 'defaultVaultName'
>;

export type PreviewSurfaceContent = Omit<RuntimeSurfaceContent, 'taskSuccess'> & {
  taskSuccess: OptionsTaskSuccessSurface;
};

export interface PreviewContent {
  brand: {
    title: string;
    subtitle: string;
    logo: string;
    websiteUrl?: string;
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
  surfaces: PreviewSurfaceContent;
  maintenanceLog: string;
}
