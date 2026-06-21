import type { SettingsSchema } from '../../types';
import type { Messages } from '@i18n';
import { grid, htmlParagraph, paragraph, stack } from '../builders/primitives';
import { boundInput, boundSelect, boundSwitch } from '../builders/controls';
import { translateSchemaMessage } from '../i18n';
import {
  fragmentKeyboardShortcutsHint,
  fragmentModifierChipItems,
  fragmentModifierStateWarning
} from '@options/app/fragmentModifierOptions';

const SIDEBAR_HIGHLIGHTS_LABEL = 'Sidebar Highlights';
const SIDEBAR_HIGHLIGHTS_LINK =
  '<a href="https://github.com/trevware/obsidian-sidebar-highlights" target="_blank" rel="noopener noreferrer">Sidebar Highlights</a>';

const schema: SettingsSchema = {
  createView(ctx) {
    const t = (key: keyof Messages) => translateSchemaMessage(ctx.t, key);
    const translate = (current: typeof ctx, key: keyof Messages) =>
      translateSchemaMessage(current.t, key);

    return {
      id: 'capture-behavior',
      kind: 'page',
      hero: {
        ...ctx.appData.captureBehavior.hero,
        title: t('schemaCaptureBehaviorTitle'),
        description: t('schemaCaptureBehaviorHeroDescription')
      },
      children: [
        {
          kind: 'group',
          title: t('schemaCaptureBehaviorReadingGroupTitle'),
          children: [
            {
              kind: 'card',
              title: t('readingConfigTitle'),
              description: t('readingConfigHint'),
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: t('readingExportModeLabel'),
                      description: t('readingExportModeDescription'),
                      control: {
                        kind: 'select',
                        options: [
                          {
                            value: 'highlights',
                            label: t('readingExportModeHighlights')
                          },
                          {
                            value: 'full',
                            label: t('readingExportModeFull')
                          }
                        ],
                        bind: 'readingExportMode',
                        onChange: {
                          id: 'options:updateField',
                          args: ['readingSession.exportMode'],
                          valueFrom: 'target.value'
                        }
                      }
                    },
                    {
                      kind: 'row',
                      title: t('readingHighlightThemeLabel'),
                      description: t('readingHighlightThemeDescription'),
                      control: stack([
                        {
                          kind: 'segmentedNav',
                          items: [
                            {
                              value: 'gradient',
                              label: t('readingHighlightThemeGradient')
                            },
                            { value: 'purple', label: t('readingHighlightThemePurple') },
                            {
                              value: 'neonYellow',
                              label: t('readingHighlightThemeNeonYellow')
                            },
                            {
                              value: 'neonGreen',
                              label: t('readingHighlightThemeNeonGreen')
                            },
                            {
                              value: 'neonOrange',
                              label: t('readingHighlightThemeNeonOrange')
                            }
                          ],
                          bind: 'highlightTheme',
                          action: { id: 'highlight:setTheme' }
                        },
                        { kind: 'highlightExample' }
                      ])
                    }
                  ]
                },
                htmlParagraph(
                  t('schemaCaptureBehaviorSidebarHighlightsNote').replace(
                    SIDEBAR_HIGHLIGHTS_LABEL,
                    SIDEBAR_HIGHLIGHTS_LINK
                  ),
                  'option-support-note'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: t('schemaCaptureBehaviorFragmentGroupTitle'),
          children: [
            {
              kind: 'card',
              title: t('fragmentConfigTitle'),
              description: t('fragmentConfigHint'),
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: t('schemaCaptureBehaviorCaptureContextTitle'),
                      description: t('fragmentCaptureContextHint'),
                      control: grid(
                        3,
                        [
                          boundSwitch({
                            bind: 'fragmentCaptureContext',
                            compact: true,
                            onChange: {
                              id: 'options:updateField',
                              args: ['fragmentClipper.captureContext'],
                              valueFrom: 'target.checked'
                            }
                          }),
                          {
                            kind: 'field',
                            label: t('schemaCaptureBehaviorContextLengthFieldLabel'),
                            control: boundInput({
                              bind: 'fragmentContextLength',
                              mono: true,
                              type: 'number',
                              onInput: {
                                id: 'options:updateField',
                                args: ['fragmentClipper.contextLength'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: t('schemaCaptureBehaviorContextModeFieldLabel'),
                            control: boundSelect({
                              bind: 'fragmentContextMode',
                              options: [
                                {
                                  value: 'chars',
                                  label: t('schemaCaptureBehaviorContextModeCharsOption')
                                },
                                {
                                  value: 'sentences',
                                  label: t('schemaCaptureBehaviorContextModeSentencesOption')
                                }
                              ],
                              onChange: {
                                id: 'options:updateField',
                                args: ['fragmentClipper.contextMode'],
                                valueFrom: 'target.value'
                              }
                            })
                          }
                        ],
                        'fragment-context-inline'
                      )
                    },
                    {
                      kind: 'row',
                      title: t('fragmentModifierToggleLabel'),
                      control: stack(
                        (current) => [
                          boundSwitch({
                            bind: 'fragmentModifierEnabled',
                            compact: true,
                            onClick: {
                              id: 'modifier:setEnabled',
                              transform: (_value, current) => !current.state.fragmentModifierEnabled
                            }
                          }),
                          {
                            kind: 'chips',
                            items: fragmentModifierChipItems(
                              current.state.modifierKeys,
                              current.messages
                            ),
                            action: { id: 'modifier:setKey' }
                          },
                          paragraph(
                            translate(current, 'fragmentModifierToggleDescription'),
                            'modifier-key-description'
                          ),
                          paragraph(
                            fragmentModifierStateWarning(current.state, current.messages),
                            'modifier-key-warning'
                          )
                        ],
                        'switch-line modifier-key-inline'
                      )
                    },
                    {
                      kind: 'row',
                      title: t('fragmentKeyboardShortcutsLabel'),
                      control: stack(
                        [
                          boundSwitch({
                            bind: 'fragmentKeyboardShortcutsEnabled',
                            stateText: (current) =>
                              current.state.fragmentKeyboardShortcutsEnabled
                                ? translate(current, 'schemaCommonEnabledState')
                                : translate(current, 'schemaCommonDisabledState'),
                            onChange: {
                              id: 'options:updateField',
                              args: ['fragmentClipper.keyboardShortcutsEnabled'],
                              valueFrom: 'target.checked'
                            }
                          }),
                          paragraph(
                            (current) => fragmentKeyboardShortcutsHint(current.messages),
                            'keyboard-shortcuts-description'
                          )
                        ],
                        'switch-line keyboard-shortcuts-inline'
                      )
                    }
                  ]
                },
                grid(
                  2,
                  [
                    {
                      kind: 'miniCard',
                      title: t('fragmentFootnoteExampleTitle'),
                      content: htmlParagraph(
                        `${t('fragmentFootnoteExampleContent')}[^1]<br><br>[^1]: ${t(
                          'fragmentFootnoteExampleComment'
                        )}`,
                        'mono'
                      )
                    },
                    {
                      kind: 'miniCard',
                      title: t('fragmentContextHighlightExampleTitle'),
                      content: paragraph(t('fragmentContextHighlightExampleContent'), 'mono')
                    }
                  ],
                  'u-mt-block'
                )
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
