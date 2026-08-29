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
  browserTarget?: SchemaContext['browserTarget'];
}

export interface ProductionStitchShellMutableState {
  createSchemaContext(this: void): SchemaContext;
  getAppData(this: void): PreviewContent;
  setAppData(this: void, appData: PreviewContent): void;
  refreshAppData(this: void): void;
  getConnectionNotice(this: void): PreviewContent['storage']['connectionNotice'] | undefined;
  setConnectionNotice(
    this: void,
    notice: PreviewContent['storage']['connectionNotice'] | undefined
  ): void;
  getCurrentLanguage(this: void): Language;
  getCurrentMessages(this: void): Messages | null;
  setLanguageResource(
    this: void,
    resource: { messages: Messages | null; language: Language }
  ): void;
  getDomainMappingRows(this: void): Array<[string, string]>;
  setDomainMappingRows(this: void, entries: Array<[string, string]>): void;
  getDraft(this: void): CompleteOptions;
  setDraft(this: void, draft: CompleteOptions): void;
  setMaintenanceLog(this: void, log: PreviewContent['maintenanceLog']): void;
  getState(this: void): PreviewStoreState;
  setState(this: void, state: PreviewStoreState): void;
  resetOptions(this: void, options?: StoredOptions | CompleteOptions | null): void;
}

export function createProductionStitchShellMutableState({
  previewContent,
  initialOptions = null,
  language,
  messages,
  browserTarget = 'chrome'
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
      state,
      browserTarget
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
