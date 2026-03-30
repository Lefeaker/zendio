import type { YamlConfigOverrides, YamlContentType } from '@shared/types/yamlConfig';
import { buildGlobalWarnings, buildTable, renderDomainOverrides } from './yamlConfigTableDom';
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
  type DomainOverrideEntry,
  type FieldRow,
  type YamlConfigDomainLabels,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';
import type {
  ControllerState,
  YamlConfigControllerOptions
} from './yamlConfigTableControllerTypes';

export function createYamlConfigControllerState(
  options: YamlConfigControllerOptions
): ControllerState {
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

  const markDirty = (): void => {
    if (rowErrors.size || globalErrors.length) {
      return;
    }
    onDirty?.();
  };

  const isFieldAvailableForContentType = (
    fieldName: string,
    contentType: YamlContentType
  ): boolean =>
    getAvailableFieldsForContentType(rows, contentType).some((row) => row.name === fieldName);

  const collectLabels = (): YamlConfigTableLabels => {
    const table = tableHost ?? document.getElementById('yamlConfigTable');
    const dataset = table?.dataset ?? {};
    const fallback = {
      field: '字段',
      type: '类型',
      article: '文章',
      clipper: '片段',
      video: '视频',
      ai: 'AI',
      defaultValue: '默认值',
      actions: '操作',
      deleteButton: '删除',
      namePlaceholder: '字段名',
      valuePlaceholder: '字段值',
      arrayPlaceholder: ARRAY_INPUT_PLACEHOLDER,
      arrayHint: ARRAY_INPUT_HINT,
      arrayPreviewEmpty: '数组值将以分号分隔保存',
      errorNameRequired: '字段名称不能为空。',
      errorNamePattern: '字段名称只能包含字母、数字、下划线或短横线，且不能以数字开头。',
      errorNameDuplicate: '字段名称重复，请修改后再保存。',
      errorTypeRequired: '请选择字段类型。',
      errorModeRequired: '至少启用一个内容类型。',
      errorValueInvalid: '默认值与字段类型不匹配。',
      errorValuePathInvalid: '值路径格式无效。',
      warningUnresolvedErrors: '请先修复 YAML 配置中的错误。',
      advancedShow: 'Show source',
      advancedHide: 'Hide source',
      valuePathLabel: 'Value path',
      valuePathPlaceholder: '例如 metadata.author',
      valuePathHint: 'Optional: read a value from the export context using dot notation.',
      valuePathExamplesTitle: 'Value path examples',
      valuePathExamples: 'metadata.author\npage.title\ncontext.timestamps',
      typeLabels: {
        article: '文章',
        clipper: '片段',
        video: '视频',
        ai_chat: 'AI'
      } as Record<YamlContentType, string>,
      defaultGroup: '默认字段',
      filterAll: '全部',
      customGroup: '自定义字段'
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
        dataset.hintArray && dataset.hintArray.includes(';')
          ? dataset.hintArray
          : fallback.arrayHint,
      arrayPreviewEmpty: dataset.hintArrayPreviewEmpty ?? fallback.arrayPreviewEmpty,
      advancedShow: dataset.labelValuePathShow ?? fallback.advancedShow,
      advancedHide: dataset.labelValuePathHide ?? fallback.advancedHide,
      valuePathLabel: dataset.labelValuePath ?? fallback.valuePathLabel,
      valuePathPlaceholder: dataset.placeholderValuePath ?? fallback.valuePathPlaceholder,
      valuePathHint: dataset.hintValuePath ?? fallback.valuePathHint,
      valuePathExamplesTitle:
        dataset.labelValuePathExamplesTitle ?? fallback.valuePathExamplesTitle,
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
        nameRequired: dataset.errorNameRequired ?? fallback.errorNameRequired,
        namePattern: dataset.errorNamePattern ?? fallback.errorNamePattern,
        nameDuplicate: dataset.errorNameDuplicate ?? fallback.errorNameDuplicate,
        typeRequired: dataset.errorTypeRequired ?? fallback.errorTypeRequired,
        modeRequired: dataset.errorModeRequired ?? fallback.errorModeRequired,
        valueInvalid: dataset.errorValueInvalid ?? fallback.errorValueInvalid,
        valuePathInvalid: dataset.errorValuePathInvalid ?? fallback.errorValuePathInvalid
      },
      warnings: {
        unresolvedErrors: dataset.warningUnresolved ?? fallback.warningUnresolvedErrors
      }
    };
  };

  const collectDomainLabels = (): YamlConfigDomainLabels => {
    const host = domainHost ?? document.getElementById('yamlDomainOverrides');
    const dataset = host?.dataset ?? {};
    return {
      title: dataset.labelTitle ?? '域名覆盖',
      addRule: dataset.labelAddRule ?? '+ 添加域名规则',
      removeRule: dataset.labelRemoveRule ?? '删除规则',
      empty: dataset.labelEmpty ?? '暂无域名级规则。',
      hint: dataset.labelHint ?? '为特定域名设置 YAML 字段覆盖；这里的设置优先于全局字段配置。',
      placeholder: dataset.placeholderDomain ?? '例如 medium.com',
      contentType: dataset.labelContentType ?? '内容类型',
      addField: dataset.labelAddField ?? '+ 添加字段',
      fieldEmpty: dataset.labelFieldEmpty ?? '该规则还没有字段配置。',
      fieldEnabled: dataset.labelFieldEnabled ?? '启用',
      fieldRemove: dataset.labelFieldRemove ?? '删除字段',
      valuePlaceholder: dataset.placeholderValue ?? '字段值',
      arrayPlaceholder:
        dataset.placeholderArray && dataset.placeholderArray.includes(';')
          ? dataset.placeholderArray
          : ARRAY_INPUT_PLACEHOLDER,
      arrayHint: dataset.hintArray ?? ARRAY_INPUT_HINT,
      arrayPreviewEmpty: dataset.hintArrayPreviewEmpty ?? '数组值将以分号分隔保存',
      valuePathLabel: dataset.labelValuePath ?? '值路径',
      valuePathPlaceholder: dataset.placeholderValuePath ?? '例如 metadata.author',
      errors: {
        domainRequired: dataset.errorDomainRequired ?? '域名不能为空。',
        domainDuplicate: dataset.errorDomainDuplicate ?? '相同内容类型下域名重复。',
        fieldRequired: dataset.errorFieldRequired ?? '至少添加一个字段。',
        fieldDuplicate: dataset.errorFieldDuplicate ?? '字段重复，请删除重复项。',
        fieldUnsupported: dataset.errorFieldUnsupported ?? '当前内容类型不支持字段:',
        valueInvalid: dataset.errorValueInvalid ?? '默认值无效:',
        valuePathInvalid: dataset.errorValuePathInvalid ?? '值路径格式无效。'
      },
      warnings: {
        unresolvedErrors: dataset.warningUnresolved ?? '请先修复 YAML 配置中的错误。'
      }
    };
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
    markDirty();
  };

  const getCustomMoveAvailability = (rowId: string) => {
    const row = rows.find((item) => item.id === rowId);
    if (!row || row.builtIn || currentSortMode || currentFilterMode) {
      return { canMoveUp: false, canMoveDown: false };
    }
    const ordered = getCustomRowsByOrder(rows, baseOrder);
    const index = ordered.findIndex((item) => item.id === rowId);
    return {
      canMoveUp: index > 0,
      canMoveDown: index !== -1 && index < ordered.length - 1
    };
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
      getFieldOptionsForEntry: (entry, currentField) =>
        getFieldOptionsForEntry(rows, entry, currentField),
      buildDomainFieldDefinition: (contentType, fieldName) =>
        findFieldDefinition(rows, contentType, fieldName),
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
          markDirty();
        },
        onRemoveDomainEntry: (entryId) => {
          domainEntries = domainEntries.filter((entry) => entry.id !== entryId);
          syncTable();
          debounceValidation();
          markDirty();
        },
        onDomainInput: (entry, value) => {
          entry.domain = value;
          debounceValidation();
        },
        onDomainBlur: () => {
          markDirty();
        },
        onContentTypeChange: (entry, contentType) => {
          entry.contentType = contentType;
          ensureDomainEntryFields(entry, rows, isFieldAvailableForContentType);
          syncTable();
          debounceValidation();
          markDirty();
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
          markDirty();
        },
        onRemoveDomainField: (entryId, fieldId) => {
          const entry = domainEntries.find((item) => item.id === entryId);
          if (!entry) {
            return;
          }
          entry.fields = entry.fields.filter((field) => field.id !== fieldId);
          syncTable();
          debounceValidation();
          markDirty();
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
          markDirty();
        },
        onDomainFieldEnabledChange: (field, checked) => {
          field.enabled = checked;
          debounceValidation();
          markDirty();
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
          markDirty();
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
          markDirty();
        }
      }
    });
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
          markDirty();
        },
        onTypeChange: (row, type) => {
          row.type = type;
          row.defaultValue = '';
          rows = sortRowsByMode(rows, currentSortMode, baseOrder);
          syncTable();
          markDirty();
        },
        onToggleContentType: (row, contentType, checked) => {
          row.enabled[contentType] = checked;
          rows = sortRowsByMode(rows, currentSortMode, baseOrder);
          syncTable();
          markDirty();
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
          markDirty();
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
          markDirty();
        }
      }
    });

    const warningsHost = buildGlobalWarnings(globalErrors);
    tableHost.replaceChildren(...(warningsHost ? [warningsHost, table] : [table]));
    renderDomainOverridesIfNeeded();
  };

  const bindAddButton = (): void => {
    const nextButton =
      addButton ??
      (typeof document !== 'undefined'
        ? (document.getElementById('yamlAddFieldBtn') as HTMLButtonElement | null)
        : null);
    addButton?.removeEventListener('click', addButtonHandler as EventListener);
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
      rows = sortRowsByMode([...rows, row], currentSortMode, baseOrder);
      syncTable();
      markDirty();
    };
    addButton.addEventListener('click', addButtonHandler);
  };

  const render = (initial: YamlConfigOverrides | null): void => {
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
      throw new Error(globalErrors[0] ?? collectLabels().warnings.unresolvedErrors);
    }
    return collectYamlConfigOverrides({ rows, domainEntries, baseOrder });
  };

  const dispose = (): void => {
    addButton?.removeEventListener('click', addButtonHandler as EventListener);
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

  return { render, collect, dispose };
}

function createRowId(seed: string): string {
  return `yaml-row-${seed}-${Math.random().toString(36).slice(2, 8)}`;
}
