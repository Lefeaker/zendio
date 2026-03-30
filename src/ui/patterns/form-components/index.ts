import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';

export interface FormGroupConfig {
  id?: string;
  label: string;
  description?: string;
  hint?: string;
  control: HTMLElement | DocumentFragment;
  actions?: HTMLElement[];
}

export interface TableColumnConfig {
  key: string;
  label: string;
  width?: string;
  className?: string;
}

export interface TableCellConfig {
  content: string | HTMLElement;
  className?: string;
}

export interface TableRowConfig {
  key: string;
  cells: TableCellConfig[];
}

export interface TableConfig {
  id?: string;
  caption?: string;
  columns: TableColumnConfig[];
  rows: TableRowConfig[];
  emptyState?: {
    title: string;
    description?: string;
  };
}

/**
 * Shared form group wrapper using DaisyUI Card component.
 *
 * Migrated to DaisyUI as part of Phase 1 migration.
 * Uses .card, .card-body, and .card-title for consistent styling.
 *
 * @see docs/251126-design-system-poc/PHASE1-MIGRATION-GUIDE.md
 */
export class AobFormGroup extends BaseComponent<FormGroupConfig> {
  render(config: FormGroupConfig): HTMLElement {
    this.assertActive();

    // DaisyUI Card 结构
    const card = this.createElement('div', 'card bg-base-100 shadow-xl');
    if (config.id) {
      card.id = config.id;
    }

    const cardBody = this.createElement('div', 'card-body');

    // Card header with title and actions
    const header = this.createElement('div', 'flex justify-between items-start mb-2');

    const titleSection = this.createElement('div', 'flex-1');
    const cardTitle = this.createElement('h2', 'card-title');
    cardTitle.textContent = config.label;
    titleSection.append(cardTitle);

    if (config.description) {
      const description = this.createElement('p', 'text-sm opacity-70 mt-1');
      description.textContent = config.description;
      titleSection.append(description);
    }

    header.append(titleSection);

    if (config.actions?.length) {
      const actions = this.createElement('div', 'card-actions justify-end');
      for (const action of config.actions) {
        actions.append(action);
      }
      header.append(actions);
    }

    cardBody.append(header);

    // Card content
    const content = this.createElement('div', 'grid gap-4 mt-4');
    content.append(config.control);

    if (config.hint) {
      const hint = this.createElement('p', 'text-sm opacity-60 mt-2');
      hint.textContent = config.hint;
      content.append(hint);
    }

    cardBody.append(content);
    card.append(cardBody);
    this.container.append(card);
    return card;
  }
}

/**
 * Lightweight table presenter optimised for settings data grids.
 */
export class AobTable extends BaseComponent<TableConfig> {
  render(config: TableConfig): HTMLElement {
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
    const table = this.createElement('table', 'w-full text-sm border-collapse');

    if (config.id) {
      table.id = config.id;
    }

    if (config.caption) {
      const caption = this.createElement(
        'caption',
        'p-2 text-sm font-medium text-base-content/60 border-b border-base-300/50 text-left'
      );
      caption.textContent = config.caption;
      table.append(caption);
    }

    table.append(this.buildTableHead(config.columns), this.buildTableBody(config));
    wrapper.append(table);
    this.container.append(wrapper);
    return wrapper;
  }

  private buildTableHead(columns: TableColumnConfig[]): HTMLTableSectionElement {
    const thead = this.createElement('thead', 'bg-base-200 text-base-content/60 font-medium');
    const row = this.createElement('tr', 'border-b border-base-300/50');
    for (const column of columns) {
      const th = this.createElement('th', 'p-3 text-left font-medium');
      if (column.className) {
        th.classList.add(column.className);
      }
      if (column.width) {
        th.style.width = column.width;
      }
      th.textContent = column.label;
      th.scope = 'col';
      th.dataset.columnKey = column.key;
      row.append(th);
    }
    thead.append(row);
    return thead;
  }

  private buildTableBody(config: TableConfig): HTMLTableSectionElement {
    const tbody = this.createElement('tbody', 'divide-y divide-border/50');

    if (!config.rows.length && config.emptyState) {
      const emptyRow = this.createElement('tr', 'bg-base-100/50');
      const emptyCell = this.createElement('td', 'p-8 text-center text-base-content/60 italic');
      emptyCell.colSpan = config.columns.length;

      const title = this.createElement('p', 'font-medium mb-1');
      title.textContent = config.emptyState.title;
      emptyCell.append(title);

      if (config.emptyState.description) {
        const description = this.createElement('p', 'text-sm opacity-80');
        description.textContent = config.emptyState.description;
        emptyCell.append(description);
      }

      emptyRow.append(emptyCell);
      tbody.append(emptyRow);
      return tbody;
    }

    for (const rowConfig of config.rows) {
      const row = this.createElement('tr', 'hover:bg-base-200 transition-colors');
      row.dataset.rowKey = rowConfig.key;

      rowConfig.cells.forEach((cellConfig, index) => {
        const cell = this.createElement('td', 'p-3 align-middle');
        if (cellConfig.className) {
          cell.classList.add(cellConfig.className);
        }

        const column = config.columns[index];
        if (column?.key) {
          cell.dataset.columnKey = column.key;
        }

        if (typeof cellConfig.content === 'string') {
          cell.textContent = cellConfig.content;
        } else {
          cell.append(cellConfig.content);
        }
        row.append(cell);
      });

      tbody.append(row);
    }

    return tbody;
  }
}
