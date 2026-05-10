import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { WidgetRuntime } from '../contracts';
import { clearWidgetContainer, notifyWidgetDirty } from '../utils';
import { DOMAIN_LABELS, YAML_WIDGET_HELPER_TEXT } from './labels';
import {
  buildDomainEntries,
  buildRows,
  collectYamlConfig,
  createCustomRow,
  createDomainField,
  createId,
  type YamlDomainEntry,
  type YamlFieldRow,
  type YamlFilter
} from './model';
import {
  renderFieldTable,
  renderFilter,
  renderGlobalErrors,
  type FieldTableCallbacks
} from './fieldTableRenderer';
import { renderDomainRules, type DomainRulesCallbacks } from './domainRulesRenderer';
import {
  hasValidationErrors,
  renderValidationState,
  validateYamlWidgetState
} from './validationPresenter';
import type { YamlValidationResult } from '../../../ui/domains/yaml-config/yamlConfigTableValidation';

export interface YamlConfigControllerProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class YamlConfigWidgetController {
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private snapshot = mergeOptions(null) as CompleteOptions;
  private rows: YamlFieldRow[] = [];
  private domainEntries: YamlDomainEntry[] = [];
  private filter: YamlFilter = 'all';
  private validation: YamlValidationResult | null = null;
  private lastValidYamlConfig: CompleteOptions['yamlConfig'] = null;

  mount(container: HTMLElement, props: YamlConfigControllerProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.applySnapshot(props.options ?? null);
    this.render();
  }

  update(props: YamlConfigControllerProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
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

  private collectYamlConfig(): CompleteOptions['yamlConfig'] {
    const validation = validateYamlWidgetState(this.rows, this.domainEntries);
    if (hasValidationErrors(validation)) {
      this.validation = validation;
      renderValidationState(this.container, this.validation);
      return this.lastValidYamlConfig;
    }
    this.validation = null;
    const collected = collectYamlConfig(this.rows, this.domainEntries);
    this.lastValidYamlConfig = collected;
    renderValidationState(this.container, this.validation);
    return collected;
  }

  private markDirty(): void {
    const validation = validateYamlWidgetState(this.rows, this.domainEntries);
    const invalid = hasValidationErrors(validation);
    this.validation = invalid ? validation : null;
    renderValidationState(this.container, this.validation);
    notifyWidgetDirty(this.runtime, ['yamlConfig'], { invalid });
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
      renderGlobalErrors(),
      renderFilter(this.filter, this.createFieldCallbacks()),
      renderFieldTable(this.rows, this.filter, this.createFieldCallbacks()),
      renderDomainRules(this.domainEntries, this.rows, this.createDomainCallbacks()),
      this.renderActions(),
      this.renderHelper()
    );
    this.container.append(host);
    renderValidationState(this.container, this.validation);
  }

  private createFieldCallbacks(): FieldTableCallbacks {
    return {
      markDirty: () => this.markDirty(),
      removeRow: (row) => {
        this.rows = this.rows.filter((candidate) => candidate !== row);
      },
      render: () => this.render(),
      setFilter: (filter) => {
        this.filter = filter;
      }
    };
  }

  private createDomainCallbacks(): DomainRulesCallbacks {
    return {
      markDirty: () => this.markDirty(),
      render: () => this.render(),
      addDomainEntry: (entry) => {
        this.domainEntries.push(entry);
      },
      removeDomainEntry: (entry) => {
        this.domainEntries = this.domainEntries.filter((candidate) => candidate !== entry);
      }
    };
  }

  private renderActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'yaml-actions stitch-yaml-actions';
    const addField = document.createElement('button');
    addField.type = 'button';
    addField.className = 'schema-button yaml-action-button primary';
    addField.textContent = DOMAIN_LABELS.addField;
    addField.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.rows.push(createCustomRow());
      this.markDirty();
      this.render();
    });
    const addRule = document.createElement('button');
    addRule.type = 'button';
    addRule.className = 'schema-button yaml-action-button secondary';
    addRule.textContent = DOMAIN_LABELS.addRule;
    addRule.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.domainEntries.push({
        id: createId('domain-rule'),
        domain: '',
        contentType: 'article',
        fields: [createDomainField(this.rows, 'article')]
      });
      this.markDirty();
      this.render();
    });
    actions.append(addField, addRule);
    return actions;
  }

  private renderHelper(): HTMLElement {
    const helper = document.createElement('p');
    helper.className = 'yaml-helper';
    helper.textContent = YAML_WIDGET_HELPER_TEXT;
    return helper;
  }
}
