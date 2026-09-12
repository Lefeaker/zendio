import type { Messages } from '@i18n';
import {
  fragmentModifierChipItems,
  fragmentModifierStateWarning
} from '@options/app/fragmentModifierOptions';
import type { NodeSchema, SchemaContext } from '../../types';
import { div, paragraph, stack } from '../builders/primitives';
import { translateSchemaMessage } from '../i18n';

function translate(current: SchemaContext, key: keyof Messages): string {
  return translateSchemaMessage(current.t, key);
}

export function createSelectionTriggerControl(): NodeSchema {
  return stack((current) => {
    const controls: NodeSchema[] = [
      {
        kind: 'segmentedNav',
        className: 'segmented-control',
        bind: 'fragmentSelectionTriggerMode',
        items: [
          {
            value: 'disabled',
            label: translate(current, 'fragmentSelectionTriggerModeDisabled')
          },
          {
            value: 'direct',
            label: translate(current, 'fragmentSelectionTriggerModeDirect')
          },
          {
            value: 'modifier',
            label: translate(current, 'fragmentSelectionTriggerModeModifier')
          }
        ],
        action: { id: 'selection-trigger:setMode' }
      }
    ];

    if (current.state.fragmentSelectionTriggerMode === 'modifier') {
      controls.push(
        div('modifier-key-choices', [
          {
            kind: 'chips',
            items: fragmentModifierChipItems(current.state.modifierKeys, current.messages),
            action: { id: 'modifier:setKey' }
          }
        ]),
        paragraph(
          fragmentModifierStateWarning(current.state, current.messages),
          'modifier-key-warning'
        )
      );
    }

    return controls;
  }, 'selection-trigger-inline modifier-key-inline');
}
