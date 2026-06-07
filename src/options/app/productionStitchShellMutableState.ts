import type { Language, Messages } from '@i18n';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { PreviewContent, PreviewStoreState, SchemaContext } from '@options/stitch/types';
import {
  applyOptionsToState,
  createInitialStitchState,
  persistTheme,
  resolveStoredTheme,
  resolveThemePreference
} from './productionStitchStateMapper';
import {
  createProductionStitchAppData,
  createProductionStitchSchemaContext
} from './productionStitchShellContext';
import { createInitialDraft, resolveDefaultDomainMappingRows } from './productionStitchShellState';

interface ProductionStitchShellMutableStateOptions {
  previewContent: PreviewContent;
  initialOptions?: StoredOptions | CompleteOptions | null;
  language: Language;
  messages: Messages | null;
}

export interface ProductionStitchShellMutableState {
  createSchemaContext(): SchemaContext;
  getAppData(): PreviewContent;
  setAppData(appData: PreviewContent): void;
  refreshAppData(): void;
  getConnectionNotice(): PreviewContent['storage']['connectionNotice'] | undefined;
  setConnectionNotice(notice: PreviewContent['storage']['connectionNotice'] | undefined): void;
  getCurrentLanguage(): Language;
  getCurrentMessages(): Messages | null;
  setLanguageResource(resource: { messages: Messages | null; language: Language }): void;
  getDomainMappingRows(): Array<[string, string]>;
  setDomainMappingRows(entries: Array<[string, string]>): void;
  getDraft(): CompleteOptions;
  setDraft(draft: CompleteOptions): void;
  setMaintenanceLog(log: PreviewContent['maintenanceLog']): void;
  getState(): PreviewStoreState;
  setState(state: PreviewStoreState): void;
  resetOptions(options?: StoredOptions | CompleteOptions | null): void;
}

export function createProductionStitchShellMutableState({
  previewContent,
  initialOptions = null,
  language,
  messages
}: ProductionStitchShellMutableStateOptions): ProductionStitchShellMutableState {
  let draft = createInitialDraft(initialOptions);
  let currentLanguage = language;
  let currentMessages = messages;
  let connectionNotice: PreviewContent['storage']['connectionNotice'] | undefined;
  let maintenanceLog = previewContent.maintenanceLog;
  let domainMappingRows: Array<[string, string]> = resolveDefaultDomainMappingRows(draft);
  let appData = createProductionStitchAppData(previewContent, draft, { maintenanceLog });
  let state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.interfaceThemePreference = resolveThemePreference(draft);
  state.previewTheme = resolveStoredTheme(draft);
  state.previewLanguage = currentLanguage;
  state.previewTheme = persistTheme(state.interfaceThemePreference);

  function createSchemaContext(): SchemaContext {
    return createProductionStitchSchemaContext({
      appData,
      previewContent,
      language: currentLanguage,
      messages: currentMessages,
      state
    });
  }

  function refreshAppData(): void {
    appData = createProductionStitchAppData(previewContent, draft, {
      ...(connectionNotice ? { connectionNotice } : {}),
      maintenanceLog
    });
    state.maintenanceLog = maintenanceLog;
  }

  return {
    createSchemaContext,
    getAppData: () => appData,
    setAppData: (nextAppData) => {
      appData = nextAppData;
    },
    refreshAppData,
    getConnectionNotice: () => connectionNotice,
    setConnectionNotice: (notice) => {
      connectionNotice = notice;
    },
    getCurrentLanguage: () => currentLanguage,
    getCurrentMessages: () => currentMessages,
    setLanguageResource: (resource) => {
      currentMessages = resource.messages;
      currentLanguage = resource.language;
      state.previewLanguage = resource.language;
    },
    getDomainMappingRows: () => domainMappingRows,
    setDomainMappingRows: (entries) => {
      domainMappingRows = entries;
    },
    getDraft: () => draft,
    setDraft: (nextDraft) => {
      draft = nextDraft;
    },
    setMaintenanceLog: (log) => {
      maintenanceLog = log;
    },
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
    },
    resetOptions: (options = null) => {
      draft = createInitialDraft(options);
      domainMappingRows = resolveDefaultDomainMappingRows(draft);
      refreshAppData();
      state = applyOptionsToState(state, draft, appData);
      state.interfaceThemePreference = resolveThemePreference(draft);
      state.previewTheme = resolveStoredTheme(draft);
      state.previewTheme = persistTheme(state.interfaceThemePreference);
    }
  };
}
