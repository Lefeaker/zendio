import { resolveSchemaValue } from './binding';
import type { NodeSchema, TableCellSchema, TableNode } from './contracts';
import { el } from './dom';
import {
  asString,
  joinClassNames,
  type RenderNode,
  type SchemaRendererRuntime
} from './rendererContext';

export function isTableCellSchema<State, AppData>(
  value: TableCellSchema<State, AppData> | NodeSchema<State, AppData>
): value is TableCellSchema<State, AppData> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !('kind' in value) &&
      ('text' in value || 'node' in value)
  );
}

export function renderTableCell<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  cell: TableCellSchema<State, AppData> | NodeSchema<State, AppData>
): HTMLElement {
  if (isTableCellSchema(cell)) {
    const typedCell = cell;
    const ctx = runtime.getContext();
    const contentNode = typedCell.node ? renderNode(typedCell.node) : null;
    return el(
      'td',
      {
        className: asString(resolveSchemaValue(typedCell.className, ctx) ?? '')
      },
      contentNode ?? asString(resolveSchemaValue(typedCell.text, ctx) ?? '')
    );
  }

  return el('td', {}, renderNode(cell));
}

export function renderTable<State, AppData>(
  runtime: SchemaRendererRuntime<State, AppData>,
  renderNode: RenderNode<State, AppData>,
  node: TableNode<State, AppData>
): HTMLElement {
  const ctx = runtime.getContext();
  const columns = resolveSchemaValue(node.columns, ctx) ?? [];
  const rows = resolveSchemaValue(node.rows, ctx) ?? [];

  return el(
    'div',
    {
      className: joinClassNames([
        'schema-table-wrap',
        asString(resolveSchemaValue(node.className, ctx) ?? '')
      ])
    },
    el(
      'table',
      { className: 'schema-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          columns.map((column) => el('th', { text: column }))
        )
      ),
      el(
        'tbody',
        {},
        rows.map((row) =>
          el(
            'tr',
            {
              className: asString(resolveSchemaValue(row.className, ctx) ?? '')
            },
            row.cells.map((cell) => renderTableCell(runtime, renderNode, cell))
          )
        )
      )
    )
  );
}
