import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import { DEFAULT_YAML_CONFIG } from '@shared/config';
import type { YamlContentType, YamlFieldConfig, YamlFieldType } from '@shared/types/yamlConfig';
import {
  parseDefaultValue,
  stringifyDefaultValue
} from '../../ui/domains/yaml-config/yamlConfigTableValueCodecs';
import {
  validateYamlConfig,
  type YamlValidationResult
} from '../../ui/domains/yaml-config/yamlConfigTableValidation';
import type {
  DomainOverrideEntry,
  FieldRow,
  YamlConfigDomainLabels,
  YamlConfigTableLabels
} from '../../ui/domains/yaml-config/yamlConfigTableTypes';
import type { BaseWidgetProps, WidgetMountContract, WidgetRuntime } from './contracts';
import { clearWidgetContainer, notifyWidgetDirty } from './utils';

export interface YamlConfigWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

type ToggleMap = Record<YamlContentType, boolean>;

interface YamlFieldRow {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: ToggleMap;
  supported: ToggleMap;
  defaultValues: Partial<Record<YamlContentType, string>>;
  valuePaths: Partial<Record<YamlContentType, string>>;
  defaultValue: string;
  valuePath: string;
  required: boolean;
  builtIn: boolean;
  isGlobal: boolean;
  originTypes: Set<YamlContentType>;
}

interface YamlDomainEntry {
  id: string;
  domain: string;
  contentType: YamlContentType;
  fields: YamlDomainField[];
}

interface YamlDomainField {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: boolean;
  defaultValue: string;
  valuePath: string;
}

const CONTENT_TYPES: YamlContentType[] = ['article', 'clipper', 'video', 'ai_chat'];
const TYPE_OPTIONS: YamlFieldType[] = ['text', 'number', 'boolean', 'date', 'array'];
const CONTENT_TYPE_LABELS: Record<YamlContentType, string> = {
  article: 'Article',
  clipper: 'Clipper',
  video: 'Video',
  ai_chat: 'AI Chat'
};

const TABLE_LABELS: YamlConfigTableLabels = {
  field: 'Field',
  type: 'Type',
  article: 'Article',
  clipper: 'Clipper',
  video: 'Video',
  ai: 'AI Chat',
  defaultValue: 'Default value',
  actions: 'Actions',
  deleteButton: 'Delete',
  namePlaceholder: 'field_name',
  valuePlaceholder: 'Default value',
  arrayPlaceholder: 'one; two; three',
  arrayHint: 'Use semicolon, comma, or line breaks to separate array values.',
  arrayPreviewEmpty: 'Array values are saved as a list.',
  advancedShow: 'Show source',
  advancedHide: 'Hide source',
  valuePathLabel: 'Value path',
  valuePathPlaceholder: 'title',
  valuePathHint: 'Read from export context using a path such as title or metadata.author.',
  valuePathExamplesTitle: 'Value path examples',
  valuePathExamples: 'title\nmetadata.author\ncontext.timestamps',
  typeLabels: CONTENT_TYPE_LABELS,
  defaultGroup: 'Default fields',
  filterAll: 'All',
  customGroup: 'Custom fields',
  errors: {
    nameRequired: 'Field name is required.',
    namePattern:
      'Field name must start with a letter or underscore and use letters, numbers, underscores, or hyphens.',
    nameDuplicate: 'Duplicate field name.',
    typeRequired: 'Field type is required.',
    modeRequired: 'Enable at least one content type.',
    valueInvalid: 'Default value does not match the field type.',
    valuePathInvalid: 'Value path format is invalid.'
  },
  warnings: {
    unresolvedErrors: 'Please fix YAML configuration errors before saving.'
  }
};

const DOMAIN_LABELS: YamlConfigDomainLabels = {
  title: 'Domain overrides',
  hint: 'Domain overrides take precedence over shared YAML field settings.',
  addRule: '+ Add domain rule',
  removeRule: 'Delete',
  empty: 'No domain overrides configured.',
  placeholder: 'example.com',
  contentType: 'Content type',
  addField: '+ Add field',
  fieldEmpty: 'Add at least one field.',
  fieldEnabled: 'Enabled',
  fieldRemove: 'Delete',
  valuePlaceholder: 'Default value',
  arrayPlaceholder: 'one; two; three',
  arrayHint: 'Use semicolon, comma, or line breaks to separate array values.',
  arrayPreviewEmpty: 'Array values are saved as a list.',
  valuePathLabel: 'Value path',
  valuePathPlaceholder: 'title',
  errors: {
    domainRequired: 'Domain is required.',
    domainDuplicate: 'Duplicate domain for this content type.',
    fieldRequired: 'Add at least one field.',
    fieldDuplicate: 'Duplicate field in this domain rule.',
    fieldUnsupported: 'Current content type does not support field:',
    valueInvalid: 'Default value does not match the field type:',
    valuePathInvalid: 'Value path format is invalid.'
  },
  warnings: {
    unresolvedErrors: 'Please fix YAML configuration errors before saving.'
  }
};

let nextId = 0;

function createId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

function createToggleMap(value: boolean): ToggleMap {
  return {
    article: value,
    clipper: value,
    video: value,
    ai_chat: value
  };
}

function getDefaultField(contentType: YamlContentType, name: string): YamlFieldConfig | undefined {
  return DEFAULT_YAML_CONFIG.contentTypes?.[contentType]?.fields.find(
    (field) => field.name === name
  );
}

function getRowDefaultValue(row: YamlFieldRow, contentType: YamlContentType): string {
  return row.defaultValues[contentType] ?? row.defaultValue;
}

function getRowValuePath(row: YamlFieldRow, contentType: YamlContentType): string {
  return row.valuePaths[contentType] ?? row.valuePath;
}

function createFieldConfig(
  row: YamlFieldRow,
  enabled: boolean,
  contentType?: YamlContentType
): YamlFieldConfig {
  const defaultValueSource = contentType ? getRowDefaultValue(row, contentType) : row.defaultValue;
  const valuePathSource = contentType ? getRowValuePath(row, contentType) : row.valuePath;
  const config: YamlFieldConfig = {
    name: row.name.trim(),
    type: row.type,
    enabled
  };
  if (row.required) {
    config.required = true;
  }
  const defaultValue = parseDefaultValue(row.type, defaultValueSource);
  if (defaultValue !== undefined) {
    config.defaultValue = defaultValue;
  }
  if (valuePathSource.trim()) {
    config.valuePath = valuePathSource.trim();
  }
  if (!row.builtIn || row.isGlobal) {
    config.isCustom = true;
  }
  return config;
}

function createDomainFieldConfig(field: YamlDomainField): YamlFieldConfig {
  const config: YamlFieldConfig = {
    name: field.name,
    type: field.type,
    enabled: field.enabled
  };
  const defaultValue = parseDefaultValue(field.type, field.defaultValue);
  if (defaultValue !== undefined) {
    config.defaultValue = defaultValue;
  }
  if (field.valuePath.trim()) {
    config.valuePath = field.valuePath.trim();
  }
  return config;
}

function shouldIncludeField(row: YamlFieldRow, contentType: YamlContentType): boolean {
  const baseline = getDefaultField(contentType, row.name.trim());
  const defaultValueSource = getRowDefaultValue(row, contentType);
  const valuePathSource = getRowValuePath(row, contentType);
  if (!baseline) {
    return row.enabled[contentType];
  }
  if ((baseline.enabled ?? true) !== row.enabled[contentType]) {
    return true;
  }
  if (baseline.valuePath !== (valuePathSource.trim() || undefined)) {
    return true;
  }
  const parsed = parseDefaultValue(row.type, defaultValueSource);
  return JSON.stringify(baseline.defaultValue ?? undefined) !== JSON.stringify(parsed);
}

function buildRows(initial: CompleteOptions): YamlFieldRow[] {
  const rows = new Map<string, YamlFieldRow>();

  const ensureRow = (
    field: YamlFieldConfig,
    contentType: YamlContentType | null,
    options: { builtIn: boolean; global?: boolean } = { builtIn: false }
  ): YamlFieldRow => {
    const key = field.name;
    let row = rows.get(key);
    if (!row) {
      row = {
        id: createId(`yaml-${key}`),
        name: field.name,
        type: field.type,
        enabled: createToggleMap(false),
        supported: createToggleMap(false),
        defaultValues: {},
        valuePaths: {},
        defaultValue: stringifyDefaultValue(field.type, field.defaultValue),
        valuePath: field.valuePath ?? '',
        required: Boolean(field.required),
        builtIn: options.builtIn,
        isGlobal: Boolean(options.global),
        originTypes: new Set<YamlContentType>()
      };
      rows.set(key, row);
    }

    row.builtIn = row.builtIn || options.builtIn;
    row.isGlobal = row.isGlobal || Boolean(options.global);
    row.required = row.required || Boolean(field.required);
    row.type = field.type ?? row.type;
    if (contentType) {
      row.originTypes.add(contentType);
      row.supported[contentType] = true;
      row.enabled[contentType] = field.enabled ?? true;
      row.defaultValues[contentType] = stringifyDefaultValue(row.type, field.defaultValue);
      row.valuePaths[contentType] = field.valuePath ?? '';
      if (!row.defaultValue && field.defaultValue !== undefined) {
        row.defaultValue = row.defaultValues[contentType] ?? '';
      }
      if (!row.valuePath && field.valuePath) {
        row.valuePath = field.valuePath;
      }
    } else {
      if (field.defaultValue !== undefined) {
        row.defaultValue = stringifyDefaultValue(row.type, field.defaultValue);
      }
      if (field.valuePath) {
        row.valuePath = field.valuePath;
      }
    }
    if (options.global) {
      CONTENT_TYPES.forEach((type) => {
        row.supported[type] = true;
        row.enabled[type] = field.enabled ?? true;
        row.defaultValues[type] = row.defaultValue;
        row.valuePaths[type] = row.valuePath;
      });
    }
    return row;
  };

  CONTENT_TYPES.forEach((contentType) => {
    const defaults = DEFAULT_YAML_CONFIG.contentTypes?.[contentType];
    defaults?.fields.forEach((field) => {
      ensureRow(field, contentType, { builtIn: true });
    });
    defaults?.customFields?.forEach((field) => {
      ensureRow(field, contentType, { builtIn: false });
    });
  });

  initial.yamlConfig?.globalFields?.forEach((field) => {
    ensureRow(field, null, { builtIn: false, global: true });
  });

  CONTENT_TYPES.forEach((contentType) => {
    const overrides = initial.yamlConfig?.contentTypes?.[contentType];
    overrides?.fields?.forEach((field) => {
      const baseline = getDefaultField(contentType, field.name);
      ensureRow(
        {
          ...baseline,
          ...field,
          type: field.type ?? baseline?.type ?? 'text',
          enabled: field.enabled ?? baseline?.enabled ?? true
        },
        contentType,
        { builtIn: Boolean(baseline) }
      );
    });
    overrides?.customFields?.forEach((field) => {
      ensureRow(field, contentType, { builtIn: false });
    });
  });

  return Array.from(rows.values()).sort((a, b) => {
    if (a.builtIn !== b.builtIn) {
      return a.builtIn ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function buildDomainEntries(initial: CompleteOptions, rows: YamlFieldRow[]): YamlDomainEntry[] {
  const entries: YamlDomainEntry[] = [];
  CONTENT_TYPES.forEach((contentType) => {
    const overrides = initial.yamlConfig?.contentTypes?.[contentType]?.domainOverrides;
    Object.entries(overrides ?? {}).forEach(([domain, fields]) => {
      entries.push({
        id: createId(`domain-${contentType}`),
        domain,
        contentType,
        fields: (fields ?? []).map((field) => {
          const definition = rows.find((row) => row.name === field.name);
          const type = field.type ?? definition?.type ?? 'text';
          return {
            id: createId(`domain-field-${field.name}`),
            name: field.name,
            type,
            enabled: field.enabled ?? true,
            defaultValue: stringifyDefaultValue(type, field.defaultValue),
            valuePath: field.valuePath ?? definition?.valuePath ?? ''
          };
        })
      });
    });
  });
  return entries;
}

export class YamlConfigWidget
  implements WidgetMountContract<YamlConfigWidgetProps, Partial<CompleteOptions>>
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private props: YamlConfigWidgetProps = {};
  private snapshot = mergeOptions(null) as CompleteOptions;
  private rows: YamlFieldRow[] = [];
  private domainEntries: YamlDomainEntry[] = [];
  private filter: YamlContentType | 'all' = 'all';
  private validation: YamlValidationResult | null = null;
  private lastValidYamlConfig: CompleteOptions['yamlConfig'] = null;

  mount(container: HTMLElement, props: YamlConfigWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.props = props;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: YamlConfigWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.props = props;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  destroy(): void {
    clearWidgetContainer(this.container);
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    return {
      yamlConfig: this.collectYamlConfig()
    } as Partial<CompleteOptions>;
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null | undefined): void {
    this.snapshot = mergeOptions(snapshot ?? null) as CompleteOptions;
    this.rows = buildRows(this.snapshot);
    this.domainEntries = buildDomainEntries(this.snapshot, this.rows);
    this.validation = null;
    this.lastValidYamlConfig = this.snapshot.yamlConfig ?? null;
  }

  private markDirty(): void {
    const validation = this.validateState();
    const invalid = this.hasValidationErrors(validation);
    this.validation = invalid ? validation : null;
    this.renderValidationState();
    notifyWidgetDirty(this.runtime, ['yamlConfig'], { invalid });
  }

  private collectYamlConfig(): CompleteOptions['yamlConfig'] {
    const validation = this.validateState();
    if (this.hasValidationErrors(validation)) {
      this.validation = validation;
      this.renderValidationState();
      return this.lastValidYamlConfig;
    }
    this.validation = null;
    const yamlConfig: NonNullable<CompleteOptions['yamlConfig']> = {
      contentTypes: {}
    };
    const globalFields = this.rows
      .filter((row) => row.isGlobal && row.name.trim())
      .map((row) =>
        createFieldConfig(
          row,
          CONTENT_TYPES.some((type) => row.enabled[type])
        )
      );
    if (globalFields.length) {
      yamlConfig.globalFields = globalFields;
    }

    CONTENT_TYPES.forEach((contentType) => {
      const fields = this.rows
        .filter(
          (row) =>
            row.builtIn &&
            !row.isGlobal &&
            row.supported[contentType] &&
            shouldIncludeField(row, contentType)
        )
        .map((row) => createFieldConfig(row, row.enabled[contentType], contentType));
      const customFields = this.rows
        .filter(
          (row) => !row.builtIn && !row.isGlobal && row.enabled[contentType] && row.name.trim()
        )
        .map((row) => createFieldConfig(row, true, contentType));
      const domainOverrides: Record<string, YamlFieldConfig[]> = {};
      this.domainEntries
        .filter(
          (entry) => entry.contentType === contentType && entry.domain.trim() && entry.fields.length
        )
        .forEach((entry) => {
          domainOverrides[entry.domain.trim()] = entry.fields.map((field) =>
            createDomainFieldConfig(field)
          );
        });

      if (fields.length || customFields.length || Object.keys(domainOverrides).length) {
        yamlConfig.contentTypes ??= {};
        yamlConfig.contentTypes[contentType] = {
          ...(fields.length ? { fields } : {}),
          ...(customFields.length ? { customFields } : {}),
          ...(Object.keys(domainOverrides).length ? { domainOverrides } : {})
        };
      }
    });

    const collected =
      yamlConfig.globalFields?.length || Object.keys(yamlConfig.contentTypes ?? {}).length
        ? yamlConfig
        : null;
    this.lastValidYamlConfig = collected;
    this.renderValidationState();
    return collected;
  }

  private validateState(): YamlValidationResult {
    const aggregate: YamlValidationResult = {
      rowErrors: new Map(),
      domainErrors: new Map(),
      globalErrors: []
    };

    CONTENT_TYPES.forEach((contentType) => {
      const validation = validateYamlConfig({
        rows: this.createValidationRowsForContentType(contentType),
        domainEntries: this.createValidationDomainEntriesForContentType(contentType),
        tableLabels: TABLE_LABELS,
        domainLabels: DOMAIN_LABELS,
        isFieldAvailableForContentType: (fieldName, candidateType) =>
          this.getFieldsForContentType(candidateType).some(
            (row) => row.name.trim() === fieldName.trim()
          )
      });
      this.mergeValidationResult(aggregate, validation);
    });

    return aggregate;
  }

  private createValidationRowsForContentType(contentType: YamlContentType): FieldRow[] {
    return this.rows
      .filter((row) => this.shouldValidateRowForContentType(row, contentType))
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        defaultValue: getRowDefaultValue(row, contentType),
        enabled: {
          ...createToggleMap(false),
          [contentType]: row.enabled[contentType]
        },
        supported: {
          ...createToggleMap(false),
          [contentType]: row.supported[contentType]
        },
        builtIn: row.builtIn,
        isCustom: !row.builtIn || row.isGlobal,
        required: row.required,
        valuePath: getRowValuePath(row, contentType),
        originTypes: row.originTypes.has(contentType)
          ? new Set<YamlContentType>([contentType])
          : new Set<YamlContentType>()
      })) as FieldRow[];
  }

  private shouldValidateRowForContentType(
    row: YamlFieldRow,
    contentType: YamlContentType
  ): boolean {
    if (row.builtIn) {
      return row.supported[contentType] || row.enabled[contentType];
    }
    if (row.isGlobal) {
      return true;
    }
    if (row.enabled[contentType] || row.originTypes.has(contentType)) {
      return true;
    }
    return contentType === 'article' && !CONTENT_TYPES.some((type) => row.enabled[type]);
  }

  private createValidationDomainEntriesForContentType(
    contentType: YamlContentType
  ): DomainOverrideEntry[] {
    return this.domainEntries
      .filter((entry) => entry.contentType === contentType)
      .map((entry) => ({
        id: entry.id,
        domain: entry.domain,
        contentType: entry.contentType,
        fields: entry.fields.map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          enabled: field.enabled,
          defaultValue: field.defaultValue,
          valuePath: field.valuePath
        }))
      })) as DomainOverrideEntry[];
  }

  private mergeValidationResult(target: YamlValidationResult, source: YamlValidationResult): void {
    source.rowErrors.forEach((errors, rowId) => {
      this.mergeValidationMessages(target.rowErrors, rowId, errors);
    });
    source.domainErrors.forEach((errors, domainId) => {
      this.mergeValidationMessages(target.domainErrors, domainId, errors);
    });
    source.globalErrors.forEach((message) => {
      if (!target.globalErrors.includes(message)) {
        target.globalErrors.push(message);
      }
    });
  }

  private mergeValidationMessages(
    target: Map<string, string[]>,
    key: string,
    messages: string[]
  ): void {
    const existing = target.get(key) ?? [];
    messages.forEach((message) => {
      if (!existing.includes(message)) {
        existing.push(message);
      }
    });
    if (existing.length) {
      target.set(key, existing);
    }
  }

  private hasValidationErrors(validation: YamlValidationResult): boolean {
    return Boolean(
      validation.globalErrors.length || validation.rowErrors.size || validation.domainErrors.size
    );
  }

  private getVisibleDefaultValue(row: YamlFieldRow): string {
    return this.filter === 'all' ? row.defaultValue : getRowDefaultValue(row, this.filter);
  }

  private getVisibleValuePath(row: YamlFieldRow): string {
    return this.filter === 'all' ? row.valuePath : getRowValuePath(row, this.filter);
  }

  private updateDefaultValue(row: YamlFieldRow, value: string): void {
    if (this.filter === 'all') {
      row.defaultValue = value;
      CONTENT_TYPES.forEach((contentType) => {
        if (row.supported[contentType] || row.enabled[contentType] || !row.builtIn) {
          row.defaultValues[contentType] = value;
        }
      });
      return;
    }
    row.defaultValues[this.filter] = value;
    row.defaultValue = value;
  }

  private updateValuePath(row: YamlFieldRow, value: string): void {
    if (this.filter === 'all') {
      row.valuePath = value;
      CONTENT_TYPES.forEach((contentType) => {
        if (row.supported[contentType] || row.enabled[contentType] || !row.builtIn) {
          row.valuePaths[contentType] = value;
        }
      });
      return;
    }
    row.valuePaths[this.filter] = value;
    row.valuePath = value;
  }

  private renderValidationState(): void {
    if (!this.container) {
      return;
    }
    this.container
      .querySelectorAll('.yaml-row-errors, .yaml-domain-error-list')
      .forEach((node) => node.remove());
    this.container
      .querySelectorAll('.is-invalid')
      .forEach((node) => node.classList.remove('is-invalid'));

    const global = this.container.querySelector<HTMLElement>('[data-yaml-errors="global"]');
    if (global) {
      global.replaceChildren();
      const errors = this.validation?.globalErrors ?? [];
      if (errors.length) {
        const list = this.renderErrorList(errors, 'yaml-global-error-list');
        global.append(list);
      }
    }

    this.validation?.rowErrors.forEach((errors, rowId) => {
      const row = Array.from(
        this.container?.querySelectorAll<HTMLElement>('[data-row-id]') ?? []
      ).find((candidate) => candidate.dataset.rowId === rowId);
      if (!row) {
        return;
      }
      row.classList.add('is-invalid');
      const lastCell = row.querySelector<HTMLTableCellElement>('td:last-child');
      lastCell?.append(this.renderErrorList(errors, 'yaml-row-errors'));
    });

    this.validation?.domainErrors.forEach((errors, entryId) => {
      const card = Array.from(
        this.container?.querySelectorAll<HTMLElement>('[data-domain-rule-id]') ?? []
      ).find((candidate) => candidate.dataset.domainRuleId === entryId);
      const host = card?.querySelector<HTMLElement>('[data-yaml-domain-errors]');
      card?.classList.add('is-invalid');
      host?.append(this.renderErrorList(errors, 'yaml-domain-error-list'));
    });
  }

  private renderErrorList(errors: string[], className: string): HTMLElement {
    const list = document.createElement('ul');
    list.className = className;
    Array.from(new Set(errors)).forEach((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      list.append(item);
    });
    return list;
  }

  private render(): void {
    if (!this.container) {
      return;
    }

    clearWidgetContainer(this.container);
    const host = document.createElement('div');
    host.className = 'schema-widget-stack yaml-config-widget stitch-yaml-config-widget';
    host.dataset.stitchWidget = 'yaml-config';
    host.append(
      this.renderGlobalErrors(),
      this.renderFilter(),
      this.renderFieldTable(),
      this.renderDomainRules(),
      this.renderActions(),
      this.renderHelper()
    );
    this.container.append(host);
    this.renderValidationState();
  }

  private renderGlobalErrors(): HTMLElement {
    const errors = document.createElement('div');
    errors.className = 'yaml-validation-errors stitch-yaml-validation-errors';
    errors.dataset.yamlErrors = 'global';
    return errors;
  }

  private renderFilter(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'yaml-filter-row stitch-yaml-filter-row';
    const items: Array<[YamlContentType | 'all', string]> = [
      ['all', 'All'],
      ['article', 'Article'],
      ['clipper', 'Clipper'],
      ['video', 'Video'],
      ['ai_chat', 'AI Chat']
    ];
    items.forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `yaml-filter${this.filter === value ? ' is-active' : ''}`;
      button.textContent = label;
      button.dataset.value = value;
      button.addEventListener('click', () => {
        this.filter = value;
        this.render();
      });
      row.append(button);
    });
    return row;
  }

  private renderFieldTable(): HTMLElement {
    const shell = document.createElement('div');
    shell.className = 'yaml-table-shell yaml-table-scroll stitch-yaml-config-table';
    const table = document.createElement('table');
    table.className = 'schema-table';
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    [
      'Field',
      'Type',
      'Article',
      'Clipper',
      'Video',
      'AI Chat',
      'Default value',
      'Value path',
      'Actions'
    ].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      header.append(th);
    });
    thead.append(header);

    const tbody = document.createElement('tbody');
    this.rows
      .filter(
        (row) => this.filter === 'all' || row.supported[this.filter] || row.enabled[this.filter]
      )
      .forEach((row) => tbody.append(this.renderFieldRow(row)));

    table.append(thead, tbody);
    shell.append(table);
    return shell;
  }

  private renderFieldRow(row: YamlFieldRow): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id;
    if (!row.builtIn) {
      tr.classList.add('is-custom');
    }

    tr.append(
      this.cell(
        this.renderTextInput(
          row.name,
          'name',
          (value) => {
            row.name = value;
          },
          { mono: true, custom: !row.builtIn }
        )
      ),
      this.cell(this.renderTypeSelect(row)),
      ...CONTENT_TYPES.map((contentType) => this.cell(this.renderToggle(row, contentType))),
      this.cell(
        this.renderTextInput(
          this.getVisibleDefaultValue(row),
          'defaultValue',
          (value) => {
            this.updateDefaultValue(row, value);
          },
          { mono: true }
        )
      ),
      this.cell(
        this.renderTextInput(
          this.getVisibleValuePath(row),
          'valuePath',
          (value) => {
            this.updateValuePath(row, value);
          },
          { mono: true }
        )
      ),
      this.cell(
        this.renderDeleteButton(() => {
          this.rows = this.rows.filter((candidate) => candidate !== row);
        }, row.builtIn)
      )
    );
    return tr;
  }

  private renderTextInput(
    value: string,
    field: string,
    update: (value: string) => void,
    options: { mono?: boolean; custom?: boolean } = {}
  ): HTMLInputElement {
    const input = document.createElement('input');
    input.className = `input${options.mono ? ' mono' : ''}`;
    input.value = value;
    input.dataset.yamlField = field;
    if (options.custom) {
      input.dataset.custom = 'true';
    }
    input.addEventListener('input', () => {
      update(input.value);
      this.markDirty();
    });
    return input;
  }

  private renderTypeSelect(row: YamlFieldRow): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'select';
    select.dataset.yamlField = 'type';
    select.disabled = row.builtIn;
    TYPE_OPTIONS.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      option.selected = row.type === type;
      select.append(option);
    });
    select.addEventListener('change', () => {
      row.type = select.value as YamlFieldType;
      this.markDirty();
    });
    return select;
  }

  private renderToggle(row: YamlFieldRow, contentType: YamlContentType): HTMLInputElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'schema-switch-input stitch-yaml-toggle';
    checkbox.dataset.mode = contentType;
    checkbox.checked = Boolean(row.enabled[contentType]);
    checkbox.disabled = row.builtIn && !row.supported[contentType];
    checkbox.addEventListener('change', () => {
      row.enabled[contentType] = checkbox.checked;
      row.supported[contentType] = row.supported[contentType] || checkbox.checked || !row.builtIn;
      this.markDirty();
    });
    return checkbox;
  }

  private renderDeleteButton(remove: () => void, disabled = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'schema-button ghost';
    button.textContent = 'Delete';
    button.disabled = disabled;
    button.addEventListener('click', () => {
      remove();
      this.markDirty();
      this.render();
    });
    return button;
  }

  private renderDomainRules(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'yaml-domain-grid stitch-yaml-domain-grid';
    if (!this.domainEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'yaml-helper';
      empty.textContent = 'No domain overrides configured.';
      grid.append(empty);
      return grid;
    }

    this.domainEntries.forEach((entry) => {
      const card = document.createElement('section');
      card.className = 'yaml-domain-rule stitch-yaml-domain-rule';
      card.dataset.domainRuleId = entry.id;
      const meta = document.createElement('div');
      meta.className = 'yaml-rule-meta';
      const typeSelect = document.createElement('select');
      typeSelect.className = 'select';
      CONTENT_TYPES.forEach((type) => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = CONTENT_TYPE_LABELS[type];
        option.selected = entry.contentType === type;
        typeSelect.append(option);
      });
      typeSelect.addEventListener('change', () => {
        entry.contentType = typeSelect.value as YamlContentType;
        this.markDirty();
        this.render();
      });
      const domain = document.createElement('input');
      domain.className = 'input mono';
      domain.value = entry.domain;
      domain.placeholder = 'example.com';
      domain.dataset.yamlDomain = 'domain';
      domain.addEventListener('input', () => {
        entry.domain = domain.value;
        this.markDirty();
      });
      meta.append(
        typeSelect,
        domain,
        this.renderDeleteButton(() => {
          this.domainEntries = this.domainEntries.filter((candidate) => candidate !== entry);
        })
      );

      const fields = document.createElement('div');
      fields.className = 'schema-stack';
      const domainErrors = document.createElement('div');
      domainErrors.className = 'yaml-domain-errors';
      domainErrors.dataset.yamlDomainErrors = entry.id;
      fields.append(domainErrors);
      entry.fields.forEach((field) => {
        const row = document.createElement('div');
        row.className = 'schema-row yaml-domain-field-row';
        row.dataset.domainFieldId = field.id;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'schema-switch-input';
        checkbox.dataset.yamlDomainField = 'enabled';
        checkbox.checked = field.enabled;
        checkbox.addEventListener('change', () => {
          field.enabled = checkbox.checked;
          this.markDirty();
        });
        const select = document.createElement('select');
        select.className = 'select';
        select.dataset.yamlDomainField = 'name';
        this.getDomainFieldOptions(entry, field).forEach((candidate) => {
          const option = document.createElement('option');
          option.value = candidate.name;
          option.textContent = candidate.name;
          option.selected = field.name === candidate.name;
          select.append(option);
        });
        select.addEventListener('change', () => {
          const definition = this.rows.find((candidate) => candidate.name === select.value);
          field.name = select.value;
          field.type = definition?.type ?? field.type;
          if (!field.valuePath && definition?.valuePath) {
            field.valuePath = definition.valuePath;
          }
          this.markDirty();
        });
        const defaultValue = this.renderTextInput(
          field.defaultValue,
          'defaultValue',
          (value) => {
            field.defaultValue = value;
          },
          { mono: true }
        );
        defaultValue.dataset.yamlDomainField = 'defaultValue';
        const valuePath = this.renderTextInput(
          field.valuePath,
          'valuePath',
          (value) => {
            field.valuePath = value;
          },
          { mono: true }
        );
        valuePath.dataset.yamlDomainField = 'valuePath';
        row.append(
          checkbox,
          select,
          defaultValue,
          valuePath,
          this.renderDeleteButton(() => {
            entry.fields = entry.fields.filter((candidate) => candidate !== field);
          })
        );
        fields.append(row);
      });
      const addField = document.createElement('button');
      addField.type = 'button';
      addField.className = 'schema-button secondary';
      addField.textContent = '+ Add field';
      addField.addEventListener('click', () => {
        entry.fields.push(this.createDomainField(entry.contentType));
        this.markDirty();
        this.render();
      });
      fields.append(addField);

      card.append(meta, fields);
      grid.append(card);
    });
    return grid;
  }

  private renderActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'yaml-actions stitch-yaml-actions';
    const addField = document.createElement('button');
    addField.type = 'button';
    addField.className = 'schema-button primary';
    addField.textContent = '+ Add field';
    addField.addEventListener('click', () => {
      const row: YamlFieldRow = {
        id: createId('yaml-custom'),
        name: 'custom_field',
        type: 'text',
        enabled: createToggleMap(false),
        supported: createToggleMap(true),
        defaultValues: {},
        valuePaths: {},
        defaultValue: '',
        valuePath: '',
        required: false,
        builtIn: false,
        isGlobal: false,
        originTypes: new Set()
      };
      this.rows.push(row);
      this.markDirty();
      this.render();
    });
    const addRule = document.createElement('button');
    addRule.type = 'button';
    addRule.className = 'schema-button secondary';
    addRule.textContent = '+ Add domain rule';
    addRule.addEventListener('click', () => {
      const entry: YamlDomainEntry = {
        id: createId('domain-rule'),
        domain: '',
        contentType: 'article',
        fields: [this.createDomainField('article')]
      };
      this.domainEntries.push(entry);
      this.markDirty();
      this.render();
    });
    actions.append(addField, addRule);
    return actions;
  }

  private renderHelper(): HTMLElement {
    const helper = document.createElement('p');
    helper.className = 'yaml-helper';
    helper.textContent =
      'Disable a switch to hide a field. Custom fields apply to the selected export types. Domain overrides take precedence over the shared table.';
    return helper;
  }

  private createDomainField(contentType: YamlContentType): YamlDomainField {
    const row = this.getFieldsForContentType(contentType)[0];
    return {
      id: createId('domain-field'),
      name: row?.name ?? 'title',
      type: row?.type ?? 'text',
      enabled: true,
      defaultValue: '',
      valuePath: row?.valuePath ?? ''
    };
  }

  private getDomainFieldOptions(entry: YamlDomainEntry, field: YamlDomainField): YamlFieldRow[] {
    const options = this.getFieldsForContentType(entry.contentType);
    if (options.some((row) => row.name === field.name)) {
      return options;
    }
    const definition = this.rows.find((row) => row.name === field.name);
    if (definition) {
      return [definition, ...options];
    }
    return [
      {
        id: createId(`domain-unsupported-${field.name}`),
        name: field.name,
        type: field.type,
        enabled: createToggleMap(false),
        supported: createToggleMap(false),
        defaultValues: {},
        valuePaths: {},
        defaultValue: field.defaultValue,
        valuePath: field.valuePath,
        required: false,
        builtIn: false,
        isGlobal: false,
        originTypes: new Set()
      },
      ...options
    ];
  }

  private getFieldsForContentType(contentType: YamlContentType): YamlFieldRow[] {
    return this.rows.filter(
      (row) => row.supported[contentType] || row.enabled[contentType] || !row.builtIn
    );
  }

  private cell(child: Node): HTMLTableCellElement {
    const td = document.createElement('td');
    td.append(child);
    return td;
  }
}
