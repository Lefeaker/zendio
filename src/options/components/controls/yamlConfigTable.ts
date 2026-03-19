import type { YamlConfigOverrides, YamlContentType } from '@shared/types/yamlConfig';
import { BaseComponent } from '../shared/BaseComponent';
import {
  buildGlobalWarnings,
  buildTable,
  renderDomainOverrides
} from './yamlConfigTableDom';
import {
  buildInitialDomainOverrides,
  buildInitialRows,
  collectYamlConfigOverrides,
  createToggleMap,
  ensureDomainEntryFields,
  findFieldDefinition,
  formatArrayValue,
  getAvailableFieldsForContentType,
  getCustomRowsByOrder,
  getFieldOptionsForEntry,
  getFilteredRows,
  nextBaseOrderValue,
  sortRowsByMode
} from './yamlConfigTableModel';
import { validateYamlConfig as validateYamlConfigState } from './yamlConfigTableValidation';
import {
  ARRAY_INPUT_HINT,
  ARRAY_INPUT_PLACEHOLDER,
  CONTENT_TYPES,
  type DomainFieldRow,
  type DomainOverrideEntry,
  type FieldRow,
  type YamlConfigDomainLabels,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';

export interface YamlConfigControllerOptions {
  tableHost?: HTMLElement | null;
  domainHost?: HTMLElement | null;
  addFieldButton?: HTMLButtonElement | null;
  onDirty?: () => void;
}

interface ControllerState {
  render(initial: YamlConfigOverrides | null): void;
  collect(): YamlConfigOverrides | null;
  dispose(): void;
}

export class YamlConfigController extends BaseComponent<YamlConfigOverrides | null | undefined> {
  private controller: ControllerState;

  constructor(options: YamlConfigControllerOptions) {
    if (!options.tableHost) {
      throw new Error('[YamlConfigController] tableHost is required.');
    }
    super(options.tableHost);
    this.controller = createControllerState({
      tableHost: this.container,
      domainHost: options.domainHost ?? null,
      addFieldButton: options.addFieldButton ?? null,
      ...(options.onDirty !== undefined && { onDirty: options.onDirty })
    });
  }

  render(initial: YamlConfigOverrides | null | undefined = null): HTMLElement {
    this.assertActive();
    this.controller.render(initial ?? null);
    return this.container;
  }

  collect(): YamlConfigOverrides | null {
    this.assertActive();
    return this.controller.collect();
  }

  dispose(): void {
    this.destroy();
  }

  override destroy(): void {
    this.controller.dispose();
    super.destroy();
  }
}

export function createYamlConfigController(options: YamlConfigControllerOptions): YamlConfigController {
  return new YamlConfigController(options);
}

function createControllerState(options: YamlConfigControllerOptions): ControllerState {
  let tableHost: HTMLElement | null = options.tableHost ?? null;
  let domainHost: HTMLElement | null = options.domainHost ?? null;
  let addButton: HTMLButtonElement | null = options.addFieldButton ?? null;
  const onDirty = options.onDirty ?? null;

  let addButtonHandler: ((event: Event) => void) | null = null;
  let rows: FieldRow[] = [];
  let baseOrder = new Map<string, number>();
  let currentSortMode: YamlContentType | null = null;
  let currentFilterMode: YamlContentType | null = null;
  let defaultGroupExpanded = true;
  let rowErrors = new Map<string, string[]>();
  let globalErrors: string[] = [];
  const advancedOpenRows = new Set<string>();
  let domainEntries: DomainOverrideEntry[] = [];
  let domainErrors = new Map<string, string[]>();
  let validationTimer: number | null = null;

  const markYamlConfigDirty = (): void => {
    if (rowErrors.size || globalErrors.length) {
      return;
    }
    onDirty?.();
  };

  const syncValidationState = (): void => {
    const validation = validateYamlConfigState({
      rows,
      domainEntries,
      tableLabels: collectLabels(),
      domainLabels: collectDomainLabels(),
      isFieldAvailableForContentType
    });
    rowErrors = validation.rowErrors;
    domainErrors = validation.domainErrors;
    globalErrors = validation.globalErrors;
  };

  const syncTable = (): void => {
    if (!tableHost) {
      return;
    }
    syncValidationState();
    const labels = collectLabels();
    const filteredRows = getFilteredRows(rows, currentFilterMode);
    const table = buildTable({
      labels,
      rows: filteredRows,
      currentFilterMode,
      currentSortMode,
      defaultGroupExpanded,
      advancedOpenRows,
      rowErrors,
      getMoveAvailability: getCustomMoveAvailability,
      onDefaultGroupToggle: (open) => {
        defaultGroupExpanded = open;
      },
      onToggleFilter: (mode) => {
        currentFilterMode = currentFilterMode === mode ? null : mode;
        rows = sortRowsByMode(rows, currentSortMode, baseOrder);
        syncTable();
      },
      onToggleSort: (mode) => {
        currentSortMode = currentSortMode === mode ? null : mode;
        rows = sortRowsByMode(rows, currentSortMode, baseOrder);
        syncTable();
      },
      rowActions: {
        onNameInput: (row, value) => {
          row.name = value;
          debounceValidation();
        },
        onNameBlur: () => {
          rows = sortRowsByMode(rows, currentSortMode, baseOrder);
          syncTable();
          markYamlConfigDirty();
        },
        onTypeChange: (row, type) => {
          row.type = type;
          row.defaultValue = '';
          rows = sortRowsByMode(rows, currentSortMode, baseOrder);
          syncTable();
          markYamlConfigDirty();
        },
        onToggleContentType: (row, contentType, checked) => {
          row.enabled[contentType] = checked;
          rows = sortRowsByMode(rows, currentSortMode, baseOrder);
          syncTable();
          markYamlConfigDirty();
        },
        onAdvancedToggle: (row) => {
          if (advancedOpenRows.has(row.id)) {
            advancedOpenRows.delete(row.id);
          } else {
            advancedOpenRows.add(row.id);
          }
          syncTable();
        },
        onMoveRow: (rowId, offset) => {
          moveCustomRow(rowId, offset);
        },
        onDeleteRow: (row) => {
          baseOrder.delete(row.id);
          rows = rows.filter((item) => item.id !== row.id);
          advancedOpenRows.delete(row.id);
          rows = sortRowsByMode(rows, currentSortMode, baseOrder);
          syncTable();
        },
        onDefaultValueInput: (row, value) => {
          row.defaultValue = value;
          debounceValidation();
        },
        onDefaultValueBlur: (row, value) => {
          const normalized = row.type === 'array' ? formatArrayValue(value) : value;
          row.defaultValue = normalized;
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = normalized;
          }
          syncTable();
          markYamlConfigDirty();
        },
        onAdvancedValuePathInput: (row, value) => {
          row.valuePath = value;
          debounceValidation();
        },
        onAdvancedValuePathBlur: (row, value) => {
          const trimmed = value.trim();
          if (trimmed) {
            row.valuePath = trimmed;
          } else {
            delete row.valuePath;
          }
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = row.valuePath ?? '';
          }
          syncTable();
          markYamlConfigDirty();
        }
      }
    });

    const warningsHost = buildGlobalWarnings(globalErrors);
    if (warningsHost) {
      tableHost.replaceChildren(warningsHost, table);
    } else {
      tableHost.replaceChildren(table);
    }
    renderDomainOverridesIfNeeded();
  };

  const renderDomainOverridesIfNeeded = (): void => {
    if (!domainHost) {
      return;
    }
    renderDomainOverrides({
      host: domainHost,
      entries: domainEntries,
      labels: collectDomainLabels(),
      tableLabels: collectLabels(),
      domainErrors,
      getFieldOptionsForEntry: (entry, currentField) => getFieldOptionsForEntry(rows, entry, currentField),
      buildDomainFieldDefinition: (contentType, fieldName) => findFieldDefinition(rows, contentType, fieldName),
      actions: {
        onAddDomainEntry: () => {
          domainEntries.push({
            id: createRowId('domain'),
            domain: '',
            contentType: CONTENT_TYPES[0],
            fields: []
          });
          syncTable();
          debounceValidation();
          markYamlConfigDirty();
        },
        onRemoveDomainEntry: (entryId) => {
          domainEntries = domainEntries.filter((entry) => entry.id !== entryId);
          syncTable();
          debounceValidation();
          markYamlConfigDirty();
        },
        onDomainInput: (entry, value) => {
          entry.domain = value;
          debounceValidation();
        },
        onDomainBlur: () => {
          markYamlConfigDirty();
        },
        onContentTypeChange: (entry, contentType) => {
          entry.contentType = contentType;
          ensureDomainEntryFields(entry, rows, isFieldAvailableForContentType);
          syncTable();
          debounceValidation();
          markYamlConfigDirty();
        },
        onAddDomainField: (entry) => {
          const candidates = getFieldOptionsForEntry(rows, entry);
          if (!candidates.length) {
            return;
          }
          const definition = candidates[0];
          entry.fields.push({
            id: createRowId(`${entry.domain || 'domain'}-${definition.name}`),
            name: definition.name,
            type: definition.type,
            enabled: definition.enabled[entry.contentType] ?? true,
            defaultValue: '',
            valuePath: definition.valuePath ?? ''
          });
          syncTable();
          debounceValidation();
          markYamlConfigDirty();
        },
        onRemoveDomainField: (entryId, fieldId) => {
          const entry = domainEntries.find((item) => item.id === entryId);
          if (!entry) {
            return;
          }
          entry.fields = entry.fields.filter((field) => field.id !== fieldId);
          syncTable();
          debounceValidation();
          markYamlConfigDirty();
        },
        onDomainFieldNameChange: (entry, field, name) => {
          const definition = findFieldDefinition(rows, entry.contentType, name);
          field.name = name;
          field.type = definition?.type ?? 'text';
          field.enabled = definition?.enabled[entry.contentType] ?? true;
          field.defaultValue = '';
          field.valuePath = definition?.valuePath ?? '';
          syncTable();
          debounceValidation();
          markYamlConfigDirty();
        },
        onDomainFieldEnabledChange: (field, checked) => {
          field.enabled = checked;
          debounceValidation();
          markYamlConfigDirty();
        },
        onDomainFieldDefaultInput: (field, value) => {
          field.defaultValue = value;
          debounceValidation();
        },
        onDomainFieldDefaultBlur: (field, value) => {
          const normalized = field.type === 'array' ? formatArrayValue(value) : value;
          field.defaultValue = normalized;
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = normalized;
          }
          markYamlConfigDirty();
        },
        onDomainFieldValuePathInput: (field, value) => {
          field.valuePath = value;
          debounceValidation();
        },
        onDomainFieldValuePathBlur: (field, value) => {
          const trimmed = value.trim();
          field.valuePath = trimmed ? trimmed : '';
          const active = document.activeElement;
          if (active instanceof HTMLInputElement) {
            active.value = field.valuePath ?? '';
          }
          markYamlConfigDirty();
        }
      }
    });
  };

  const bindAddButton = (): void => {
    const nextButton =
      addButton ??
      (typeof document !== 'undefined'
        ? (document.getElementById('yamlAddFieldBtn') as HTMLButtonElement | null)
        : null);
    if (addButton && addButtonHandler) {
      addButton.removeEventListener('click', addButtonHandler);
    }
    addButton = nextButton;
    if (!addButton) {
      addButtonHandler = null;
      return;
    }
    addButtonHandler = () => {
      const row: FieldRow = {
        id: createRowId('custom'),
        name: '',
        type: 'text',
        defaultValue: '',
        enabled: createToggleMap(false),
        supported: createToggleMap(true),
        builtIn: false,
        isCustom: true,
        required: false,
        originTypes: new Set()
      };
      baseOrder.set(row.id, nextBaseOrderValue(baseOrder));
      rows = [...rows, row];
      rows = sortRowsByMode(rows, currentSortMode, baseOrder);
      syncTable();
      markYamlConfigDirty();
    };
    addButton.addEventListener('click', addButtonHandler);
  };

  const renderYamlConfigEditor = (initial?: YamlConfigOverrides | null): void => {
    if (!tableHost && typeof document !== 'undefined') {
      tableHost = document.getElementById('yamlConfigTable');
    }
    if (!domainHost && typeof document !== 'undefined') {
      domainHost = document.getElementById('yamlDomainOverrides');
    }
    if (!addButton && typeof document !== 'undefined') {
      addButton = document.getElementById('yamlAddFieldBtn') as HTMLButtonElement | null;
    }
    if (!tableHost) {
      return;
    }

    rows = buildInitialRows(initial ?? undefined);
    advancedOpenRows.clear();
    rows.forEach((row) => {
      if (row.valuePath?.trim()) {
        advancedOpenRows.add(row.id);
      }
    });
    baseOrder = new Map(rows.map((row, index) => [row.id, index]));
    currentSortMode = null;
    currentFilterMode = null;
    defaultGroupExpanded = true;
    rowErrors = new Map();
    globalErrors = [];
    domainEntries = buildInitialDomainOverrides(initial ?? undefined, rows);
    domainErrors = new Map();
    rows = sortRowsByMode(rows, currentSortMode, baseOrder);
    syncTable();
    bindAddButton();
  };

  const collect = (): YamlConfigOverrides | null => {
    if (!rows.length) {
      return null;
    }
    syncValidationState();
    syncTable();
    if (rowErrors.size || globalErrors.length) {
      const labels = collectLabels();
      throw new Error(globalErrors[0] ?? labels.warnings.unresolvedErrors);
    }
    return collectYamlConfigOverrides({ rows, domainEntries, baseOrder });
  };

  const isFieldAvailableForContentType = (fieldName: string, contentType: YamlContentType): boolean =>
    getAvailableFieldsForContentType(rows, contentType).some((row) => row.name === fieldName);

  const getCustomMoveAvailability = (rowId: string): { canMoveUp: boolean; canMoveDown: boolean } => {
    const row = rows.find((item) => item.id === rowId);
    if (!row || row.builtIn) {
      return { canMoveUp: false, canMoveDown: false };
    }
    if (currentSortMode || currentFilterMode) {
      return { canMoveUp: false, canMoveDown: false };
    }
    const ordered = getCustomRowsByOrder(rows, baseOrder);
    const index = ordered.findIndex((item) => item.id === rowId);
    return {
      canMoveUp: index > 0,
      canMoveDown: index !== -1 && index < ordered.length - 1
    };
  };

  const moveCustomRow = (rowId: string, offset: number): void => {
    if (currentSortMode || currentFilterMode || offset === 0) {
      return;
    }
    const ordered = getCustomRowsByOrder(rows, baseOrder);
    const index = ordered.findIndex((item) => item.id === rowId);
    if (index === -1) {
      return;
    }
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= ordered.length) {
      return;
    }
    const sourceRow = ordered[index];
    const targetRow = ordered[targetIndex];
    const sourceOrder = baseOrder.get(sourceRow.id) ?? 0;
    const targetOrder = baseOrder.get(targetRow.id) ?? 0;
    baseOrder.set(sourceRow.id, targetOrder);
    baseOrder.set(targetRow.id, sourceOrder);
    rows = sortRowsByMode(rows, currentSortMode, baseOrder);
    syncTable();
    markYamlConfigDirty();
  };

  const debounceValidation = (): void => {
    if (validationTimer) {
      window.clearTimeout(validationTimer);
    }
    validationTimer = window.setTimeout(() => {
      validationTimer = null;
      syncValidationState();
      syncTable();
    }, 250);
  };

  const dispose = (): void => {
    if (addButton && addButtonHandler) {
      addButton.removeEventListener('click', addButtonHandler);
    }
    if (validationTimer) {
      window.clearTimeout(validationTimer);
    }
    rows = [];
    baseOrder = new Map();
    currentSortMode = null;
    currentFilterMode = null;
    defaultGroupExpanded = true;
    rowErrors = new Map();
    globalErrors = [];
    advancedOpenRows.clear();
    domainEntries = [];
    domainErrors = new Map();
    tableHost = null;
    domainHost = null;
    addButton = null;
    addButtonHandler = null;
    validationTimer = null;
  };

  return {
    render: renderYamlConfigEditor,
    collect,
    dispose
  };

  function createRowId(seed: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${seed}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function collectLabels(): YamlConfigTableLabels {
    const dataset = tableHost?.dataset ?? {};
    const fallback = {
      field: 'Field',
      type: 'Type',
      article: 'Article',
      clipper: 'Clipper',
      video: 'Video',
      ai: 'AI',
      defaultValue: 'Value',
      actions: 'Actions',
      deleteButton: 'Delete',
      namePlaceholder: 'Field name',
      valuePlaceholder: 'Field value',
      arrayPlaceholder: ARRAY_INPUT_PLACEHOLDER,
      arrayHint: ARRAY_INPUT_HINT,
      arrayPreviewEmpty: 'No items configured',
      valuePathExamplesTitle: '常见上下文字段',
      valuePathExamples: 'meta.author\nstats.wordCount\nextra.notes[0]',
      defaultGroup: '默认字段',
      filterAll: 'All',
      customGroup: 'Custom fields'
    };

    return {
      field: dataset.labelField ?? fallback.field,
      type: dataset.labelType ?? fallback.type,
      article: dataset.labelArticle ?? fallback.article,
      clipper: dataset.labelClipper ?? fallback.clipper,
      video: dataset.labelVideo ?? fallback.video,
      ai: dataset.labelAi ?? fallback.ai,
      defaultValue: dataset.labelDefault ?? fallback.defaultValue,
      actions: dataset.labelActions ?? fallback.actions,
      deleteButton: dataset.labelDelete ?? fallback.deleteButton,
      namePlaceholder: dataset.placeholderName ?? fallback.namePlaceholder,
      valuePlaceholder: dataset.placeholderValue ?? fallback.valuePlaceholder,
      arrayPlaceholder:
        dataset.placeholderArray && dataset.placeholderArray.includes(';')
          ? dataset.placeholderArray
          : fallback.arrayPlaceholder,
      arrayHint:
        dataset.hintArray && dataset.hintArray.includes(';') ? dataset.hintArray : fallback.arrayHint,
      arrayPreviewEmpty: dataset.hintArrayPreviewEmpty ?? fallback.arrayPreviewEmpty,
      advancedShow: dataset.labelAdvancedShow ?? 'Show source',
      advancedHide: dataset.labelAdvancedHide ?? 'Hide source',
      valuePathLabel: dataset.labelValuePath ?? 'Value path',
      valuePathPlaceholder: dataset.placeholderValuePath ?? 'e.g. meta.author or extra.notes[0]',
      valuePathHint:
        dataset.hintValuePath ??
        'Optional: map this field to data in the capture context. Leave empty to use captured or default values.',
      valuePathExamplesTitle: dataset.labelValuePathExamplesTitle ?? fallback.valuePathExamplesTitle,
      valuePathExamples: dataset.hintValuePathExamples ?? fallback.valuePathExamples,
      typeLabels: {
        article: dataset.labelArticle ?? fallback.article,
        clipper: dataset.labelClipper ?? fallback.clipper,
        video: dataset.labelVideo ?? fallback.video,
        ai_chat: dataset.labelAi ?? fallback.ai
      },
      defaultGroup: dataset.labelDefaultGroup ?? fallback.defaultGroup,
      filterAll: dataset.labelFilterAll ?? fallback.filterAll,
      customGroup: dataset.labelCustomGroup ?? fallback.customGroup,
      errors: {
        nameRequired: dataset.errorNameRequired ?? 'Field name is required',
        namePattern:
          dataset.errorNamePattern ??
          'Only letters, numbers, underscores, or dashes are allowed, and it cannot start with a number.',
        nameDuplicate: dataset.errorNameDuplicate ?? 'Duplicate field name, please pick another.',
        typeRequired: dataset.errorTypeRequired ?? 'Select a field type.',
        modeRequired: dataset.errorModeRequired ?? 'Enable at least one content type.',
        valueInvalid: dataset.errorValueInvalid ?? 'Default value does not match the field type.',
        valuePathInvalid: dataset.errorValuePathInvalid ?? 'Value path cannot contain spaces.'
      },
      warnings: {
        unresolvedErrors: dataset.warningUnresolved ?? 'Fix the highlighted errors before saving.'
      }
    };
  }

  function collectDomainLabels(): YamlConfigDomainLabels {
    const dataset = domainHost?.dataset ?? {};
    return {
      title: dataset.labelTitle ?? '域名覆盖',
      hint: dataset.labelHint ?? '针对特定域名调整字段启用状态与默认值，优先级高于全局设置。',
      addRule: dataset.labelAddRule ?? '+ 添加域名规则',
      removeRule: dataset.labelRemoveRule ?? '删除规则',
      empty: dataset.labelEmpty ?? '尚未创建任何域名规则。',
      placeholder: dataset.placeholderDomain ?? '例如 example.com 或 *.example.com',
      contentType: dataset.labelContentType ?? '内容类型',
      addField: dataset.labelAddField ?? '+ 添加字段',
      fieldEmpty: dataset.labelFieldEmpty ?? '未配置字段',
      fieldEnabled: dataset.labelFieldEnabled ?? '启用',
      fieldRemove: dataset.labelFieldRemove ?? '移除',
      valuePlaceholder: dataset.placeholderValue ?? '默认值（可选）',
      arrayPlaceholder:
        dataset.placeholderValueArray && dataset.placeholderValueArray.includes(';')
          ? dataset.placeholderValueArray
          : ARRAY_INPUT_PLACEHOLDER,
      arrayHint:
        dataset.hintValueArray && dataset.hintValueArray.includes(';') ? dataset.hintValueArray : ARRAY_INPUT_HINT,
      arrayPreviewEmpty: dataset.hintArrayPreviewEmpty ?? '未配置数组项',
      valuePathLabel: dataset.labelValuePath ?? 'Value path (可选)',
      valuePathPlaceholder: dataset.placeholderValuePath ?? '如 meta.author',
      errors: {
        domainRequired: dataset.errorDomainRequired ?? '域名不能为空。',
        domainDuplicate: dataset.errorDomainDuplicate ?? '同一内容类型中存在重复的域名规则。',
        fieldRequired: dataset.errorFieldRequired ?? '至少选择一个字段。',
        fieldDuplicate: dataset.errorFieldDuplicate ?? '同一规则中存在重复字段。',
        fieldUnsupported: dataset.errorFieldUnsupported ?? '字段在当前内容类型中不可用：',
        valueInvalid: dataset.errorValueInvalid ?? '字段默认值与类型不匹配：',
        valuePathInvalid: dataset.errorValuePathInvalid ?? 'Value path 不能包含空格。'
      },
      warnings: {
        unresolvedErrors: dataset.warningUnresolved ?? '修复域名规则中的错误后再保存。'
      }
    };
  }
}
