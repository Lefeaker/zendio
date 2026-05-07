import type {
  ActionReference,
  ButtonVariant,
  DynamicValue,
  NodeSchema,
  TableCellSchema,
  TableRowSchema
} from '../../types';
import { buttonNode, code } from './primitives';
import { classNames } from './classNames';

type CellProps = Record<string, string | number | boolean>;

export function textCell(text: DynamicValue<string | number>, props?: CellProps): TableCellSchema {
  return {
    ...(props ? { props } : {}),
    text
  };
}

export function codeCell(text: DynamicValue<string | number>, props?: CellProps): TableCellSchema {
  return {
    ...(props ? { props } : {}),
    node: code(text)
  };
}

export function buttonCell(
  label: DynamicValue<string>,
  variant?: DynamicValue<ButtonVariant>,
  action?: DynamicValue<ActionReference>,
  props?: CellProps
): TableCellSchema {
  return {
    ...(props ? { props } : {}),
    node: buttonNode(label, variant, action)
  };
}

export function centerCell(node: NodeSchema): TableCellSchema {
  return {
    props: { className: classNames.table.centerCell },
    node
  };
}

export function switchCell(node: NodeSchema): TableCellSchema {
  return centerCell(node);
}

export function groupRow(
  text: DynamicValue<string | number>,
  colspan: number,
  className = classNames.yaml.groupRow
): TableRowSchema {
  return {
    rowProps: { className },
    cells: [textCell(text, { colspan })]
  };
}
