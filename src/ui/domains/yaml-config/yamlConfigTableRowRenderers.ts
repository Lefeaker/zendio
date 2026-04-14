import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import { createCheckboxElement } from '../../primitives/checkbox';
import { createInputElement } from '../../primitives/input';
import { createSelectElement } from '../../primitives/select';
import { createLayoutElement } from '../../primitives/layout';
import {
  CONTENT_TYPES,
  TYPE_OPTIONS,
  type FieldRow,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';
import { buildYamlErrorList } from './yamlConfigTableMessageBuilders';
import {
  buildYamlAdvancedPanel,
  buildYamlDefaultValueEditor
} from './yamlConfigTableRowEditors';
import { buildYamlRowActionContainer } from './yamlConfigTableRowActions';

export interface RowActions {
  onNameInput: (row: FieldRow, value: string) => void;
  onNameBlur: (row: FieldRow) => void;
  onTypeChange: (row: FieldRow, type: YamlFieldType) => void;
  onToggleContentType: (row: FieldRow, contentType: YamlContentType, checked: boolean) => void;
  onAdvancedToggle: (row: FieldRow) => void;
  onMoveRow: (rowId: string, offset: number) => void;
  onDeleteRow: (row: FieldRow) => void;
  onDefaultValueInput: (row: FieldRow, value: string) => void;
  onDefaultValueBlur: (row: FieldRow, value: string) => void;
  onAdvancedValuePathInput: (row: FieldRow, value: string) => void;
  onAdvancedValuePathBlur: (row: FieldRow, value: string) => void;
}

export function buildYamlTableRow(args: {
  row: FieldRow;
  labels: YamlConfigTableLabels;
  advancedOpenRows: Set<string>;
  rowErrors: Map<string, string[]>;
  getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
  actions: RowActions;
}): HTMLElement {
  const { row, labels, advancedOpenRows, rowErrors, getMoveAvailability, actions } = args;
  const rowElement = createLayoutElement({
    className:
      'aobx-table__row grid grid-cols-[minmax(120px,1.5fr)_100px_repeat(4,60px)_minmax(120px,1fr)_80px] items-center gap-2 border-b border-base-300 p-3 transition-colors hover:bg-base-200 last:border-b-0'
  });
  rowElement.dataset.rowId = row.id;

  const appendCell = (content: HTMLElement): void => {
    const cell = createLayoutElement({ className: 'flex items-center overflow-hidden' });
    cell.append(content);
    rowElement.append(cell);
  };

  const nameInput = createInputElement({
    type: 'text',
    value: row.name,
    placeholder: labels.namePlaceholder,
    disabled: row.builtIn,
    className: 'w-full h-8 text-sm disabled:opacity-50'
  });
  nameInput.addEventListener('input', (event) =>
    actions.onNameInput(row, (event.target as HTMLInputElement).value)
  );
  nameInput.addEventListener('blur', () => actions.onNameBlur(row));
  appendCell(nameInput);

  const typeSelect = createSelectElement({
    value: row.type,
    disabled: row.builtIn,
    className: 'w-full h-8 text-sm disabled:opacity-50',
    options: TYPE_OPTIONS.map((option) => ({ value: option, label: option }))
  });
  typeSelect.addEventListener('change', (event) => {
    actions.onTypeChange(row, (event.target as HTMLSelectElement).value as YamlFieldType);
  });
  appendCell(typeSelect);

  for (const contentType of CONTENT_TYPES) {
    const supported = row.supported[contentType] || row.isCustom;
    if (!supported) {
      const placeholder = document.createElement('span');
      placeholder.className = 'text-base-content/30 select-none';
      placeholder.textContent = '—';
      appendCell(placeholder);
      continue;
    }

    const checkboxWrapper = createLayoutElement({
      className: 'flex w-full items-center justify-center'
    });
    checkboxWrapper.setAttribute('aria-label', labels.typeLabels[contentType]);
    const { root, input: checkbox } = createCheckboxElement({
      checked: row.enabled[contentType],
      labelClassName: 'justify-center',
      inputClassName: 'cursor-pointer'
    });
    checkbox.addEventListener('change', (event) => {
      actions.onToggleContentType(row, contentType, (event.target as HTMLInputElement).checked);
    });
    checkboxWrapper.append(root);
    appendCell(checkboxWrapper);
  }

  const isAdvancedOpen = advancedOpenRows.has(row.id);
  appendCell(buildYamlDefaultValueEditor(row, labels, actions));
  const actionContainer = buildYamlRowActionContainer({
    row,
    labels,
    isAdvancedOpen,
    getMoveAvailability,
    actions
  });
  appendCell(actionContainer);

  if (isAdvancedOpen) {
    rowElement.classList.add('bg-base-200/50');
    rowElement.append(buildYamlAdvancedPanel(row, labels, actions));
  }

  const errors = rowErrors.get(row.id);
  if (errors?.length) {
    rowElement.classList.add('bg-destructive/5');
    rowElement.append(buildYamlErrorList('yaml-row-errors', errors));
  }

  return rowElement;
}
