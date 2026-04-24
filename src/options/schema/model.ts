import type { CompleteOptions } from '@shared/types/options';
import type { Messages } from '@i18n';
import type { SelectOption } from '../schema-runtime';

export type OptionsSchemaPanelId =
  | 'overview'
  | 'storage'
  | 'capture-sources'
  | 'capture-behavior'
  | 'output'
  | 'experimental'
  | 'maintenance';

export type OptionsSchemaResourceId =
  | 'onboarding'
  | 'plugin-setup'
  | 'support'
  | 'suggestions'
  | 'contact'
  | 'changelog';

export interface OptionsSchemaNavItem {
  id: OptionsSchemaPanelId;
  label: string;
  hint: string;
}

export interface OptionsSchemaResourceItem {
  id: OptionsSchemaResourceId;
  label: string;
  hint: string;
}

export interface OptionsSchemaResourceGroup {
  id: string;
  title: string;
  items: OptionsSchemaResourceItem[];
}

export interface SchemaShellAppData {
  brand: {
    title: string;
    subtitle: string;
  };
  messages: Messages | null;
  panelOrder: OptionsSchemaPanelId[];
  settingsGroupTitle: string;
  nav: OptionsSchemaNavItem[];
  resources: OptionsSchemaResourceGroup[];
  languageOptions: SelectOption[];
  subtitleLanguages: SelectOption[];
  yamlFilterOptions: SelectOption[];
  readingPathModes: SelectOption[];
  templateTokens: string[];
}

export interface SchemaShellState {
  activePanel: OptionsSchemaPanelId;
  activeResource: OptionsSchemaResourceId | null;
  language: string;
  options: CompleteOptions;
  readingPathMode: string;
  yamlFilter: string;
  activeTemplateField: string;
  transferLogMessage: string | null;
  diagnosisVisible: boolean;
  diagnosisOutput: string;
}
