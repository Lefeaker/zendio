import type { YamlContentType } from '@shared/types/yamlConfig';
import { validateYamlConfig } from './yamlConfigTableValidation';
import type { YamlConfigDomainLabels, YamlConfigTableLabels } from './yamlConfigTableTypes';
import type { YamlConfigControllerInternalState } from './yamlConfigTableControllerStateTypes';

export function syncYamlConfigControllerValidationState(
  state: YamlConfigControllerInternalState,
  labels: {
    tableLabels: YamlConfigTableLabels;
    domainLabels: YamlConfigDomainLabels;
  },
  isFieldAvailableForContentType: (fieldName: string, contentType: YamlContentType) => boolean
): void {
  const validation = validateYamlConfig({
    rows: state.rows,
    domainEntries: state.domainEntries,
    tableLabels: labels.tableLabels,
    domainLabels: labels.domainLabels,
    isFieldAvailableForContentType
  });
  state.rowErrors = validation.rowErrors;
  state.domainErrors = validation.domainErrors;
  state.globalErrors = validation.globalErrors;
}

export function debounceYamlConfigControllerValidation(
  state: YamlConfigControllerInternalState,
  callbacks: {
    syncValidationState: () => void;
    onValidated: () => void;
  }
): void {
  clearYamlConfigControllerValidationTimer(state);
  state.validationTimer = window.setTimeout(() => {
    state.validationTimer = null;
    callbacks.syncValidationState();
    callbacks.onValidated();
  }, 250);
}

export function clearYamlConfigControllerValidationTimer(
  state: YamlConfigControllerInternalState
): void {
  if (!state.validationTimer) {
    return;
  }
  window.clearTimeout(state.validationTimer);
  state.validationTimer = null;
}
