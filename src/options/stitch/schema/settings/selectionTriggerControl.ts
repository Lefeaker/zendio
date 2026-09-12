import type { Messages } from '@i18n';
import {
  DEFAULT_FRAGMENT_MODIFIER_KEY,
  fragmentModifierChoices,
  normalizeFragmentModifierKeys,
  fragmentModifierStateWarning
} from '@options/app/fragmentModifierOptions';
import type { NodeSchema, SchemaContext } from '../../types';
import { element, paragraph, stack } from '../builders/primitives';
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

    controls.push(
      element(
        'div',
        {
          className: 'modifier-key-choices',
          style: {
            display: current.state.fragmentSelectionTriggerMode === 'modifier' ? 'grid' : 'none'
          }
        },
        [
          {
            kind: 'segmentedNav',
            className: 'segmented-control',
            items: fragmentModifierChoices(undefined, current.messages),
            value:
              normalizeFragmentModifierKeys(current.state.modifierKeys)[0] ??
              DEFAULT_FRAGMENT_MODIFIER_KEY,
            action: { id: 'modifier:setKey' }
          },
          paragraph(
            fragmentModifierStateWarning(current.state, current.messages),
            'modifier-key-warning'
          )
        ]
      )
    );

    return controls;
  }, 'selection-trigger-inline modifier-key-inline');
}
