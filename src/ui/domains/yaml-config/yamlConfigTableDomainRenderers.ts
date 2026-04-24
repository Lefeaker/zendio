import type { YamlContentType } from '@shared/types/yamlConfig';
import { createOptionsButtonElement } from '../../primitives/button';
import { createCheckboxElement } from '../../primitives/checkbox';
import { createInputElement } from '../../primitives/input';
import { createSelectElement } from '../../primitives/select';
import {
  createOptionsActionRow,
  createOptionsHintText,
  createLayoutElement,
  createOptionsPanel
} from '../../primitives/layout';
import {
  ARRAY_INPUT_PLACEHOLDER,
  CONTENT_TYPES,
  type DomainFieldRow,
  type DomainOverrideEntry,
  type FieldRow,
  type YamlConfigDomainLabels,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';
import { formatArrayValue } from './yamlConfigTableStateModel';
import { buildYamlErrorList } from './yamlConfigTableMessageBuilders';
import {
  buildDomainCard,
  type DomainFieldRendererActions
} from './yamlConfigTableDomainFieldRenderers';

export interface DomainActions extends DomainFieldRendererActions {
  onAddDomainEntry: () => void;
}

export function renderDomainOverrides(args: {
  host: HTMLElement;
  entries: DomainOverrideEntry[];
  labels: YamlConfigDomainLabels;
  tableLabels: YamlConfigTableLabels;
  domainErrors: Map<string, string[]>;
  getFieldOptionsForEntry: (
    entry: DomainOverrideEntry,
    currentField?: DomainFieldRow
  ) => FieldRow[];
  buildDomainFieldDefinition: (
    contentType: YamlContentType,
    fieldName: string
  ) => FieldRow | undefined;
  actions: DomainActions;
}): void {
  const {
    host,
    entries,
    labels,
    tableLabels,
    domainErrors,
    getFieldOptionsForEntry,
    buildDomainFieldDefinition,
    actions
  } = args;
  const wrapper = createLayoutElement({ className: 'aobx-domain schema-output-domain-shell' });

  const header = createOptionsActionRow({
    className: 'aobx-domain__header schema-output-widget-header pt-0'
  });
  const title = createLayoutElement({ tag: 'h3' });
  title.textContent = labels.title;
  const addButton = createOptionsButtonElement({
    label: labels.addRule,
    variant: 'primary',
    size: 'sm',
    className: 'aobx-btn aobx-domain__add-btn'
  });
  addButton.addEventListener('click', actions.onAddDomainEntry);
  header.append(title, addButton);

  const list = createLayoutElement({ className: 'aobx-domain__list schema-output-domain-list' });
  if (!entries.length) {
    const empty = createLayoutElement({
      className: 'aobx-domain__empty',
      textContent: labels.empty
    });
    list.append(empty);
  } else {
    entries.forEach((entry) => {
      list.append(
        buildDomainCard({
          entry,
          labels,
          typeLabels: Object.fromEntries(
            CONTENT_TYPES.map((type) => [type, tableLabels.typeLabels[type] ?? type])
          ) as Record<YamlContentType, string>,
          errors: domainErrors.get(entry.id) ?? [],
          getFieldOptionsForEntry,
          actions,
          buildErrorList: (nextErrors) => buildYamlErrorList('aobx-domain__errors', nextErrors)
        })
      );
    });
  }

  const hint = createOptionsHintText({
    className: 'aobx-domain__hint',
    text: labels.hint
  });
  wrapper.append(header, list, hint);
  host.replaceChildren(wrapper);
}
