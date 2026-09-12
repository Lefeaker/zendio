import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';
import { replaceChildrenWithSafeRichText } from '@shared/i18n/richTextDom';

export interface DaisyTableProps {
  minWidthClass?: string;
  header: HTMLElement;
  body: HTMLElement[];
}

export interface PrimitiveTableCell {
  props?: Record<string, string | number | boolean> | undefined;
  node?: Node | null | undefined;
  html?: string | undefined;
  text?: string | number | undefined;
}

export interface PrimitiveTableRow {
  rowProps?: Record<string, string | number | boolean> | undefined;
  cells: PrimitiveTableCell[];
}

export interface PrimitiveTableElementProps {
  columns: string[];
  rows: PrimitiveTableRow[];
  wrapperClassName?: string;
}

function applyAttributes(
  target: HTMLElement,
  props: Record<string, string | number | boolean>
): void {
  for (const [key, value] of Object.entries(props)) {
    if (key in target) {
      (target as HTMLElement & Record<string, unknown>)[key] = value;
    } else {
      target.setAttribute(key, String(value));
    }
  }
}

export function createTableElement({
  columns,
  rows,
  wrapperClassName = 'table-wrap'
}: PrimitiveTableElementProps): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = wrapperClassName;
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const column of columns) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = column;
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const rowElement = document.createElement('tr');
    if (row.rowProps) applyAttributes(rowElement, row.rowProps);
    for (const cellConfig of row.cells) {
      const cell = document.createElement('td');
      if (cellConfig.props) applyAttributes(cell, cellConfig.props);
      if (cellConfig.node !== undefined && cellConfig.node !== null) cell.append(cellConfig.node);
      else if (cellConfig.html) {
        const content = document.createElement('span');
        replaceChildrenWithSafeRichText(content, cellConfig.html);
        cell.append(content);
      } else if (cellConfig.text !== undefined) cell.textContent = String(cellConfig.text);
      rowElement.append(cell);
    }
    body.append(rowElement);
  }
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

/**
 * Lightweight table presenter retained as a UI primitive after old shared entry removal.
 */
export class DaisyTable extends BaseComponent<DaisyTableProps> {
  render(props: DaisyTableProps): HTMLDivElement {
    this.assertActive();

    const wrapper = this.createElement(
      'div',
      [
        'w-full',
        'overflow-auto',
        'rounded-lg',
        'border',
        'border-base-300',
        'bg-base-100',
        'shadow-sm'
      ].join(' ')
    );
    const table = this.createElement(
      'table',
      ['w-full', 'text-sm', props.minWidthClass ?? ''].filter(Boolean).join(' ')
    );
    table.append(props.header, ...props.body);
    wrapper.append(table);
    this.container.replaceChildren(wrapper);
    return wrapper;
  }
}
