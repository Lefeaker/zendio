import type { YamlContentType } from '@shared/types/yamlConfig';
import type { FieldRow } from './yamlConfigTableTypes';

export function compareByBaseOrder(
  a: FieldRow,
  b: FieldRow,
  baseOrder: Map<string, number>
): number {
  const aOrder = baseOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const bOrder = baseOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return a.name.localeCompare(b.name);
}

export function getRowsInBaseOrder(rows: FieldRow[], baseOrder: Map<string, number>): FieldRow[] {
  return [...rows].sort((a, b) => compareByBaseOrder(a, b, baseOrder));
}

export function sortRowsByMode(
  rows: FieldRow[],
  mode: YamlContentType | null,
  baseOrder: Map<string, number>
): FieldRow[] {
  if (!mode) {
    return getRowsInBaseOrder(rows, baseOrder);
  }
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const priority = (row: FieldRow) => (row.enabled[mode] ? 0 : 1) + (row.isCustom ? -0.5 : 0);
    const diff = priority(a) - priority(b);
    if (diff !== 0) {
      return diff;
    }
    return compareByBaseOrder(a, b, baseOrder);
  });
  return sorted;
}

export function getFilteredRows(rows: FieldRow[], mode: YamlContentType | null): FieldRow[] {
  if (!mode) {
    return [...rows];
  }
  return rows.filter((row) => {
    if (row.isCustom) {
      return row.enabled[mode];
    }
    return row.supported[mode] || row.enabled[mode];
  });
}

export function getCustomRowsByOrder(rows: FieldRow[], baseOrder: Map<string, number>): FieldRow[] {
  return getRowsInBaseOrder(rows, baseOrder).filter((row) => !row.builtIn);
}

export function nextBaseOrderValue(baseOrder: Map<string, number>): number {
  let max = -1;
  baseOrder.forEach((value) => {
    if (value > max) {
      max = value;
    }
  });
  return max + 1;
}
