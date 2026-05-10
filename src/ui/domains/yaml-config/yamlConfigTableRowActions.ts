import { createOptionsButtonElement } from '../../primitives/button';
import { createOptionsActionRow } from '../../primitives/layout';
import type { FieldRow, RowActions, YamlConfigTableLabels } from './yamlConfigTableTypes';

export function buildYamlRowActionContainer(args: {
  row: FieldRow;
  labels: YamlConfigTableLabels;
  isAdvancedOpen: boolean;
  getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
  actions: RowActions;
}): HTMLElement {
  const { row, labels, isAdvancedOpen, getMoveAvailability, actions } = args;
  const actionContainer = createOptionsActionRow({
    className: 'flex items-center justify-end gap-1 pt-0'
  });

  const advancedButton = createOptionsButtonElement({
    label: isAdvancedOpen ? labels.advancedHide : labels.advancedShow,
    variant: 'ghost',
    size: 'sm',
    className: 'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200'
  });
  if (row.valuePath && row.valuePath.trim()) {
    advancedButton.classList.add('text-accent');
  }
  advancedButton.addEventListener('click', () => actions.onAdvancedToggle(row));
  actionContainer.append(advancedButton);

  if (row.builtIn) {
    const disabledLabel = document.createElement('span');
    disabledLabel.className = 'text-base-content/30 select-none w-6 text-center';
    disabledLabel.textContent = '—';
    actionContainer.append(disabledLabel);
    return actionContainer;
  }

  const moveInfo = getMoveAvailability(row.id);
  const moveUp = createOptionsButtonElement({
    label: '↑',
    variant: 'ghost',
    size: 'sm',
    disabled: !moveInfo.canMoveUp,
    className:
      'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 disabled:opacity-30 disabled:hover:bg-transparent'
  });
  moveUp.addEventListener('click', () => actions.onMoveRow(row.id, -1));
  actionContainer.append(moveUp);

  const moveDown = createOptionsButtonElement({
    label: '↓',
    variant: 'ghost',
    size: 'sm',
    disabled: !moveInfo.canMoveDown,
    className:
      'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 disabled:opacity-30 disabled:hover:bg-transparent'
  });
  moveDown.addEventListener('click', () => actions.onMoveRow(row.id, 1));
  actionContainer.append(moveDown);

  const deleteButton = createOptionsButtonElement({
    label: '×',
    variant: 'ghost',
    size: 'sm',
    title: labels.deleteButton,
    className: 'w-6 h-6 rounded text-destructive hover:bg-destructive/10'
  });
  deleteButton.addEventListener('click', () => actions.onDeleteRow(row));
  actionContainer.append(deleteButton);

  return actionContainer;
}
