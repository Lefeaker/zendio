import { button, el } from './dom';
import {
  createCustomField,
  renderFieldTable,
  renderFilter,
  type YamlConfigEditorViewOptions
} from './fieldRowsView';
import { addDomainRule, renderDomainRules } from './domainRulesView';
import { renderPreview, updateYamlPreview } from './previewView';
import { renderYamlEditorValidation } from './validationView';

function renderActions(options: YamlConfigEditorViewOptions): HTMLElement {
  const actions = el('div', { className: 'yaml-actions stitch-yaml-actions' });
  actions.append(
    button({
      className: 'schema-button yaml-action-button primary',
      text: options.labels.table.addField,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const fieldId = createCustomField(options.state, options.filter);
        options.onChange();
        options.onRender({ scrollTarget: { kind: 'field', fieldId } });
      }
    }),
    button({
      className: 'schema-button yaml-action-button secondary',
      text: options.labels.table.addDomainRule,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const { domainEntryId, domainFieldId } = addDomainRule(options.state, options.filter);
        options.onChange();
        options.onRender({
          scrollTarget: {
            kind: 'domainField',
            domainEntryId,
            fieldId: domainFieldId
          }
        });
      }
    })
  );
  return actions;
}

export function renderYamlConfigEditorView(options: YamlConfigEditorViewOptions): HTMLElement {
  const host = el('div', {
    className: 'schema-widget-stack yaml-config-widget stitch-yaml-config-widget',
    dataset: { stitchWidget: 'yaml-config' }
  });
  const liveOptions: YamlConfigEditorViewOptions = {
    ...options,
    onChange: () => {
      options.onChange();
      updateYamlPreview(host, liveOptions);
    }
  };
  host.append(
    el('div', {
      className: 'yaml-validation-errors stitch-yaml-validation-errors',
      dataset: { yamlErrors: 'global' }
    }),
    renderFilter(liveOptions),
    renderFieldTable(liveOptions),
    renderDomainRules(liveOptions),
    renderActions(liveOptions),
    el('p', { className: 'yaml-helper', text: options.labels.table.helper }),
    renderPreview(liveOptions)
  );
  renderYamlEditorValidation(host, options.validation, options.labels);
  return host;
}

export { renderYamlEditorValidation } from './validationView';
export type {
  YamlEditorFilter,
  YamlConfigEditorViewOptions,
  YamlEditorRenderRequest,
  YamlEditorScrollTarget
} from './fieldRowsView';
