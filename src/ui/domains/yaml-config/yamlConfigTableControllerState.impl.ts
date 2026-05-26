import type { YamlConfigOverrides, YamlContentType } from '@shared/types/yamlConfig';
import { buildGlobalWarnings, buildTable, renderDomainOverrides } from './yamlConfigTableDom';
import {
  getAvailableFieldsForContentType,
  getFieldOptionsForEntry,
  getFilteredRows,
  sortRowsByMode
} from './yamlConfigTableModel';
import { type YamlConfigDomainLabels, type YamlConfigTableLabels } from './yamlConfigTableTypes';
import type {
  ControllerState,
  YamlConfigControllerOptions
} from './yamlConfigTableControllerTypes';
import { collectYamlDomainLabels, collectYamlTableLabels } from './yamlConfigTableLabels';
import type { YamlConfigControllerInternalState } from './yamlConfigTableControllerStateTypes';
import {
  addYamlConfigCustomRow,
  deleteYamlConfigRow,
  getYamlConfigCustomMoveAvailability,
  moveYamlConfigCustomRow,
  normalizeYamlConfigRowDefaultValue,
  normalizeYamlConfigRowValuePath,
  toggleYamlConfigRowContentType,
  updateYamlConfigRowDefaultValue,
  updateYamlConfigRowName,
  updateYamlConfigRowType,
  updateYamlConfigRowValuePath
} from './yamlConfigTableControllerRows';
import {
  resetYamlConfigSelectionState,
  setYamlConfigDefaultGroupExpanded,
  toggleYamlConfigAdvancedRow,
  toggleYamlConfigFilterMode,
  toggleYamlConfigSortMode
} from './yamlConfigTableControllerSelection';
import {
  addYamlConfigDomainEntry,
  addYamlConfigDomainField,
  normalizeYamlConfigDomainFieldDefaultValue,
  normalizeYamlConfigDomainFieldValuePath,
  removeYamlConfigDomainEntry,
  removeYamlConfigDomainField,
  setYamlConfigDomainContentType,
  setYamlConfigDomainFieldEnabled,
  updateYamlConfigDomainFieldDefaultValue,
  updateYamlConfigDomainFieldName,
  updateYamlConfigDomainFieldValuePath,
  updateYamlConfigDomainInput
} from './yamlConfigTableControllerDomainOverrides';
import {
  applyYamlConfigControllerSnapshot,
  collectYamlConfigControllerSnapshot
} from './yamlConfigTableControllerPersistence';
import {
  clearYamlConfigControllerValidationTimer,
  debounceYamlConfigControllerValidation,
  syncYamlConfigControllerValidationState
} from './yamlConfigTableControllerValidation';

export function createYamlConfigControllerState(
  options: YamlConfigControllerOptions
): ControllerState {
  const state: YamlConfigControllerInternalState = {
    tableHost: options.tableHost ?? null,
    domainHost: options.domainHost ?? null,
    addButton: options.addFieldButton ?? null,
    addButtonHandler: null,
    rows: [],
    baseOrder: new Map<string, number>(),
    currentSortMode: null,
    currentFilterMode: null,
    defaultGroupExpanded: true,
    rowErrors: new Map<string, string[]>(),
    globalErrors: [],
    advancedOpenRows: new Set<string>(),
    domainEntries: [],
    domainErrors: new Map<string, string[]>(),
    validationTimer: null
  };
  const onDirty = options.onDirty ?? null;

  const markDirty = (): void => {
    if (state.rowErrors.size || state.globalErrors.length) {
      return;
    }
    onDirty?.();
  };

  const isFieldAvailableForContentType = (
    fieldName: string,
    contentType: YamlContentType
  ): boolean =>
    getAvailableFieldsForContentType(state.rows, contentType).some((row) => row.name === fieldName);

  const collectLabels = (): YamlConfigTableLabels =>
    collectYamlTableLabels(state.tableHost ?? document.getElementById('yamlConfigTable'));

  const collectDomainLabels = (): YamlConfigDomainLabels =>
    collectYamlDomainLabels(state.domainHost ?? document.getElementById('yamlDomainOverrides'));

  const syncValidationState = (): void => {
    syncYamlConfigControllerValidationState(
      state,
      {
        tableLabels: collectLabels(),
        domainLabels: collectDomainLabels()
      },
      isFieldAvailableForContentType
    );
  };

  const debounceValidation = (): void => {
    debounceYamlConfigControllerValidation(state, {
      syncValidationState,
      onValidated: syncTable
    });
  };

  const renderDomainOverridesIfNeeded = (): void => {
    if (!state.domainHost) {
      return;
    }
    renderDomainOverrides({
      host: state.domainHost,
      entries: state.domainEntries,
      labels: collectDomainLabels(),
      tableLabels: collectLabels(),
      domainErrors: state.domainErrors,
      getFieldOptionsForEntry: (entry, currentField) =>
        getFieldOptionsForEntry(state.rows, entry, currentField),
      actions: {
        onAddDomainEntry: () => {
          addYamlConfigDomainEntry(state);
          syncTable();
          debounceValidation();
          markDirty();
        },
        onRemoveDomainEntry: (entryId) => {
          removeYamlConfigDomainEntry(state, entryId);
          syncTable();
          debounceValidation();
          markDirty();
        },
        onDomainInput: (entry, value) => {
          updateYamlConfigDomainInput(entry, value);
          debounceValidation();
        },
        onDomainBlur: () => {
          markDirty();
        },
        onContentTypeChange: (entry, contentType) => {
          setYamlConfigDomainContentType(state, entry, contentType, isFieldAvailableForContentType);
          syncTable();
          debounceValidation();
          markDirty();
        },
        onAddDomainField: (entry) => {
          if (!addYamlConfigDomainField(state, entry)) {
            return;
          }
          syncTable();
          debounceValidation();
          markDirty();
        },
        onRemoveDomainField: (entryId, fieldId) => {
          if (!removeYamlConfigDomainField(state, entryId, fieldId)) {
            return;
          }
          syncTable();
          debounceValidation();
          markDirty();
        },
        onDomainFieldNameChange: (entry, field, name) => {
          updateYamlConfigDomainFieldName(state, entry, field, name);
          syncTable();
          debounceValidation();
          markDirty();
        },
        onDomainFieldEnabledChange: (field, checked) => {
          setYamlConfigDomainFieldEnabled(field, checked);
          debounceValidation();
          markDirty();
        },
        onDomainFieldDefaultInput: (field, value) => {
          updateYamlConfigDomainFieldDefaultValue(field, value);
          debounceValidation();
        },
        onDomainFieldDefaultBlur: (field, value) => {
          const normalized = normalizeYamlConfigDomainFieldDefaultValue(field, value);
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = normalized;
          }
          markDirty();
        },
        onDomainFieldValuePathInput: (field, value) => {
          updateYamlConfigDomainFieldValuePath(field, value);
          debounceValidation();
        },
        onDomainFieldValuePathBlur: (field, value) => {
          const normalized = normalizeYamlConfigDomainFieldValuePath(field, value);
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = normalized;
          }
          markDirty();
        }
      }
    });
  };

  const syncTable = (): void => {
    if (!state.tableHost) {
      return;
    }
    syncValidationState();
    const labels = collectLabels();
    const filteredRows = getFilteredRows(state.rows, state.currentFilterMode);
    const table = buildTable({
      labels,
      rows: filteredRows,
      currentFilterMode: state.currentFilterMode,
      currentSortMode: state.currentSortMode,
      defaultGroupExpanded: state.defaultGroupExpanded,
      advancedOpenRows: state.advancedOpenRows,
      rowErrors: state.rowErrors,
      getMoveAvailability: (rowId) => getYamlConfigCustomMoveAvailability(state, rowId),
      onDefaultGroupToggle: (open) => {
        setYamlConfigDefaultGroupExpanded(state, open);
      },
      onToggleFilter: (mode) => {
        toggleYamlConfigFilterMode(state, mode);
        syncTable();
      },
      onToggleSort: (mode) => {
        toggleYamlConfigSortMode(state, mode);
        syncTable();
      },
      rowActions: {
        onNameInput: (row, value) => {
          updateYamlConfigRowName(row, value);
          debounceValidation();
        },
        onNameBlur: () => {
          state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
          syncTable();
          markDirty();
        },
        onTypeChange: (row, type) => {
          updateYamlConfigRowType(state, row, type);
          syncTable();
          markDirty();
        },
        onToggleContentType: (row, contentType, checked) => {
          toggleYamlConfigRowContentType(state, row, contentType, checked);
          syncTable();
          markDirty();
        },
        onAdvancedToggle: (row) => {
          toggleYamlConfigAdvancedRow(state, row);
          syncTable();
        },
        onMoveRow: (rowId, offset) => {
          if (moveYamlConfigCustomRow(state, rowId, offset)) {
            syncTable();
            markDirty();
          }
        },
        onDeleteRow: (row) => {
          deleteYamlConfigRow(state, row);
          syncTable();
        },
        onDefaultValueInput: (row, value) => {
          updateYamlConfigRowDefaultValue(row, value);
          debounceValidation();
        },
        onDefaultValueBlur: (row, value) => {
          const normalized = normalizeYamlConfigRowDefaultValue(row, value);
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = normalized;
          }
          syncTable();
          markDirty();
        },
        onAdvancedValuePathInput: (row, value) => {
          updateYamlConfigRowValuePath(row, value);
          debounceValidation();
        },
        onAdvancedValuePathBlur: (row, value) => {
          const normalized = normalizeYamlConfigRowValuePath(row, value);
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = normalized;
          }
          syncTable();
          markDirty();
        }
      }
    });

    const warningsHost = buildGlobalWarnings(state.globalErrors);
    state.tableHost.replaceChildren(...(warningsHost ? [warningsHost, table] : [table]));
    renderDomainOverridesIfNeeded();
  };

  const bindAddButton = (): void => {
    const nextButton =
      state.addButton ??
      (typeof document !== 'undefined'
        ? (document.getElementById('yamlAddFieldBtn') as HTMLButtonElement | null)
        : null);
    state.addButton?.removeEventListener('click', state.addButtonHandler as EventListener);
    state.addButton = nextButton;
    if (!state.addButton) {
      state.addButtonHandler = null;
      return;
    }
    state.addButtonHandler = () => {
      addYamlConfigCustomRow(state);
      syncTable();
      markDirty();
    };
    state.addButton.addEventListener('click', state.addButtonHandler);
  };

  const render = (initial: YamlConfigOverrides | null): void => {
    if (!state.tableHost && typeof document !== 'undefined') {
      state.tableHost = document.getElementById('yamlConfigTable');
    }
    if (!state.domainHost && typeof document !== 'undefined') {
      state.domainHost = document.getElementById('yamlDomainOverrides');
    }
    if (!state.addButton && typeof document !== 'undefined') {
      state.addButton = document.getElementById('yamlAddFieldBtn') as HTMLButtonElement | null;
    }
    if (!state.tableHost) {
      return;
    }

    applyYamlConfigControllerSnapshot(state, initial);
    syncTable();
    bindAddButton();
  };

  const collect = (): YamlConfigOverrides | null => {
    return collectYamlConfigControllerSnapshot(state, {
      syncValidationState,
      syncTable,
      getUnresolvedErrorMessage: () => collectLabels().warnings.unresolvedErrors
    });
  };

  const dispose = (): void => {
    state.addButton?.removeEventListener('click', state.addButtonHandler as EventListener);
    clearYamlConfigControllerValidationTimer(state);
    state.rows = [];
    state.baseOrder = new Map();
    resetYamlConfigSelectionState(state);
    state.rowErrors = new Map();
    state.globalErrors = [];
    state.domainEntries = [];
    state.domainErrors = new Map();
    state.tableHost = null;
    state.domainHost = null;
    state.addButton = null;
    state.addButtonHandler = null;
    state.validationTimer = null;
  };

  return { render, collect, dispose };
}
