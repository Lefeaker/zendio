import type { DynamicValue, NodeChild, NodeSchema, NoticeNode } from '../../types';
import { element, pre, toolbar } from './primitives';
import { classNames } from './classNames';

export function actionToolbar(actions: DynamicValue<NodeChild[]>, extraClass?: string): NodeSchema {
  return toolbar(actions, extraClass);
}

export function sectionHelper(
  text: DynamicValue<string | number>,
  className: string = classNames.common.surfaceHelperText
): NodeSchema {
  return element('div', {
    className,
    text
  });
}

export function infoBox(
  title: DynamicValue<string>,
  body: DynamicValue<string | NodeChild | NodeChild[]>,
  variant: NoticeNode['variant'] = 'info'
): NodeSchema {
  return {
    kind: 'notice',
    title,
    body,
    variant
  };
}

export function codeOutputBox(
  content: DynamicValue<string | number>,
  className: string = classNames.common.outputBox
): NodeSchema {
  return element('div', { className }, [pre(content)]);
}
