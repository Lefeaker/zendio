import type { NodeSchema } from '@options/schema-runtime';
import type { SchemaShellAppData, SchemaShellState } from '../model';
import { schemaClassNames } from './classNames';

type SchemaNode = NodeSchema<SchemaShellState, SchemaShellAppData>;

export function createOutputWidgetGroup(
  title: string,
  widgetType: string,
  options: SchemaShellState['options'],
  messages: SchemaShellAppData['messages']
): SchemaNode {
  return {
    kind: 'group',
    className: schemaClassNames.output.section,
    title,
    children: [
      {
        kind: 'card',
        className: schemaClassNames.output.card,
        children: [
          {
            kind: 'widget',
            className: schemaClassNames.output.widgetHost,
            widgetType,
            props: { options, messages }
          }
        ]
      }
    ]
  };
}
