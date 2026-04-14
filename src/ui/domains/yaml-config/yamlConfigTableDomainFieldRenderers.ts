import type { YamlContentType } from '@shared/types/yamlConfig';
import { createOptionsButtonElement } from '../../primitives/button';
import { createCheckboxElement } from '../../primitives/checkbox';
import { createInputElement } from '../../primitives/input';
import { createSelectElement } from '../../primitives/select';
import {
  createLayoutElement,
  createOptionsActionRow,
  createOptionsPanel
} from '../../primitives/layout';
import {
  type DomainFieldRow,
  type DomainOverrideEntry,
  type FieldRow,
  type YamlConfigDomainLabels
} from './yamlConfigTableTypes';
import { buildDomainFieldValueEditor } from './yamlConfigTableDomainFieldValueEditor';

export interface DomainFieldRendererActions {
  onRemoveDomainEntry: (entryId: string) => void;
  onDomainInput: (entry: DomainOverrideEntry, value: string) => void;
  onDomainBlur: () => void;
  onContentTypeChange: (entry: DomainOverrideEntry, contentType: YamlContentType) => void;
  onAddDomainField: (entry: DomainOverrideEntry) => void;
  onRemoveDomainField: (entryId: string, fieldId: string) => void;
  onDomainFieldNameChange: (
    entry: DomainOverrideEntry,
    field: DomainFieldRow,
    name: string
  ) => void;
  onDomainFieldEnabledChange: (field: DomainFieldRow, checked: boolean) => void;
  onDomainFieldDefaultInput: (field: DomainFieldRow, value: string) => void;
  onDomainFieldDefaultBlur: (field: DomainFieldRow, value: string) => void;
  onDomainFieldValuePathInput: (field: DomainFieldRow, value: string) => void;
  onDomainFieldValuePathBlur: (field: DomainFieldRow, value: string) => void;
}

export function buildDomainCard(args: {
  entry: DomainOverrideEntry;
  labels: YamlConfigDomainLabels;
  typeLabels: Record<YamlContentType, string>;
  errors: string[];
  getFieldOptionsForEntry: (
    entry: DomainOverrideEntry,
    currentField?: DomainFieldRow
  ) => FieldRow[];
  actions: DomainFieldRendererActions;
  buildErrorList: (errors: string[]) => HTMLElement;
}): HTMLElement {
  const { entry, labels, typeLabels, errors, getFieldOptionsForEntry, actions, buildErrorList } =
    args;
  const card = createOptionsPanel({
    className: 'aobx-domain__card alert alert-error aobx-table__global-errors p-3 text-sm'
  });
  card.dataset.entryId = entry.id;
  if (errors.length) {
    card.classList.add('has-error');
  }

  const header = createOptionsActionRow({ className: 'aobx-domain__card-header pt-0' });
  const domainInput = createInputElement({
    type: 'text',
    value: entry.domain,
    placeholder: labels.placeholder,
    className: 'w-full min-h-[36px] aobx-domain__domain-input'
  });
  domainInput.addEventListener('input', (event) =>
    actions.onDomainInput(entry, (event.target as HTMLInputElement).value)
  );
  domainInput.addEventListener('blur', () => actions.onDomainBlur());
  header.append(domainInput);

  const typeSelect = createSelectElement({
    value: entry.contentType,
    className: 'w-full min-h-[36px] aobx-domain__type-select',
    options: Object.entries(typeLabels).map(([value, label]) => ({
      value,
      label
    }))
  });
  typeSelect.addEventListener('change', (event) => {
    actions.onContentTypeChange(
      entry,
      (event.target as HTMLSelectElement).value as YamlContentType
    );
  });
  header.append(typeSelect);

  const removeButton = createOptionsButtonElement({
    label: labels.removeRule,
    variant: 'danger',
    size: 'sm',
    className: 'aobx-btn aobx-domain__remove-btn'
  });
  removeButton.addEventListener('click', () => actions.onRemoveDomainEntry(entry.id));
  header.append(removeButton);
  card.append(header);

  const fieldsContainer = createLayoutElement({ className: 'aobx-domain__fields' });
  if (!entry.fields.length) {
    const empty = createLayoutElement({
      className: 'aobx-domain__field-empty',
      textContent: labels.fieldEmpty
    });
    fieldsContainer.append(empty);
  } else {
    entry.fields.forEach((field) => {
      fieldsContainer.append(
        buildDomainField({
          entry,
          field,
          labels,
          options: getFieldOptionsForEntry(entry, field),
          actions
        })
      );
    });
  }
  card.append(fieldsContainer);

  const addFieldButton = createOptionsButtonElement({
    label: labels.addField,
    variant: 'secondary',
    size: 'sm',
    disabled: getFieldOptionsForEntry(entry).length === 0,
    className: 'aobx-domain__add-field-btn'
  });
  addFieldButton.addEventListener('click', () => actions.onAddDomainField(entry));
  card.append(addFieldButton);

  if (errors.length) {
    card.append(buildErrorList(errors));
  }

  return card;
}

function buildDomainField(args: {
  entry: DomainOverrideEntry;
  field: DomainFieldRow;
  labels: YamlConfigDomainLabels;
  options: FieldRow[];
  actions: DomainFieldRendererActions;
}): HTMLElement {
  const { entry, field, labels, options, actions } = args;
  const container = createLayoutElement({ className: 'aobx-domain__field' });
  container.dataset.fieldId = field.id;

  const header = createOptionsActionRow({ className: 'aobx-domain__field-header pt-0' });
  const nameSelect = createSelectElement({
    value: field.name,
    className: 'w-full min-h-[36px] aobx-domain__field-select',
    options: options.map((option) => ({
      value: option.name,
      label: `${option.name} (${option.type})`
    }))
  });
  nameSelect.addEventListener('change', (event) => {
    actions.onDomainFieldNameChange(entry, field, (event.target as HTMLSelectElement).value);
  });
  header.append(nameSelect);

  const { root: enabledLabel, input: checkbox } = createCheckboxElement({
    checked: field.enabled,
    label: labels.fieldEnabled,
    labelClassName: 'aobx-domain__field-enabled'
  });
  checkbox.addEventListener('change', (event) => {
    actions.onDomainFieldEnabledChange(field, (event.target as HTMLInputElement).checked);
  });
  header.append(enabledLabel);

  const removeButton = createOptionsButtonElement({
    label: labels.fieldRemove,
    variant: 'danger',
    size: 'sm',
    className: 'aobx-btn aobx-domain__field-remove'
  });
  removeButton.addEventListener('click', () => actions.onRemoveDomainField(entry.id, field.id));
  header.append(removeButton);
  container.append(header, buildDomainFieldValueEditor(field, labels, actions));
  return container;
}
