import type { YamlContentType } from '@shared/types/yamlConfig';
import type { DomainOverrideEntry, FieldRow } from './yamlConfigTableTypes';

export interface YamlConfigControllerInternalState {
  tableHost: HTMLElement | null;
  domainHost: HTMLElement | null;
  addButton: HTMLButtonElement | null;
  addButtonHandler: ((event: Event) => void) | null;
  rows: FieldRow[];
  baseOrder: Map<string, number>;
  currentSortMode: YamlContentType | null;
  currentFilterMode: YamlContentType | null;
  defaultGroupExpanded: boolean;
  rowErrors: Map<string, string[]>;
  globalErrors: string[];
  advancedOpenRows: Set<string>;
  domainEntries: DomainOverrideEntry[];
  domainErrors: Map<string, string[]>;
  validationTimer: number | null;
}
