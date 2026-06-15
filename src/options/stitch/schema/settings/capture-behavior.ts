import type { SettingsSchema } from '../../types';
import type { Messages } from '@i18n';
import { grid, htmlParagraph, paragraph, stack } from '../builders/primitives';
import { boundInput, boundSelect, boundSwitch } from '../builders/controls';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';
import {
  fragmentModifierChipItems,
  fragmentModifierStateWarning
} from '@options/app/fragmentModifierOptions';

const schema: SettingsSchema = {
  createView(ctx) {
    const t = (key: keyof Messages, fallback: string) => ctx.t?.(key, fallback) ?? fallback;
    const translate = (current: typeof ctx, key: keyof Messages, fallback: string) =>
      current.t?.(key, fallback) ?? fallback;

    return {
      id: 'capture-behavior',
      kind: 'page',
      hero: {
        ...ctx.appData.captureBehavior.hero,
        title: t('schemaCaptureBehaviorTitle', ctx.appData.captureBehavior.hero.title),
        description: t(
          'schemaCaptureBehaviorHeroDescription',
          ctx.appData.captureBehavior.hero.description
        )
      },
      children: [
        {
          kind: 'group',
          title: t('schemaCaptureBehaviorReadingGroupTitle', 'Reading Mode'),
          children: [
            {
              kind: 'card',
              title: t('readingConfigTitle', 'Reading Export'),
              description: t(
                'readingConfigHint',
                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingConfigHint
              ),
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: t(
                        'readingExportModeLabel',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingExportModeLabel
                      ),
                      description: t(
                        'readingExportModeDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingExportModeDescription
                      ),
                      control: {
                        kind: 'select',
                        options: [
                          {
                            value: 'highlights',
                            label: t(
                              'readingExportModeHighlights',
                              DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingExportModeHighlights
                            )
                          },
                          {
                            value: 'full',
                            label: t(
                              'readingExportModeFull',
                              DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingExportModeFull
                            )
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
                      title: t(
                        'readingHighlightThemeLabel',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingHighlightThemeLabel
                      ),
                      description: t(
                        'readingHighlightThemeDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingHighlightThemeDescription
                      ),
                      control: stack([
                        {
                          kind: 'segmentedNav',
                          items: [
                            {
                              value: 'gradient',
                              label: t('readingHighlightThemeGradient', 'Gradient')
                            },
                            { value: 'purple', label: t('readingHighlightThemePurple', 'Purple') },
                            {
                              value: 'neonYellow',
                              label: t('readingHighlightThemeNeonYellow', 'Neon Yellow')
                            },
                            {
                              value: 'neonGreen',
                              label: t('readingHighlightThemeNeonGreen', 'Neon Green')
                            },
                            {
                              value: 'neonOrange',
                              label: t('readingHighlightThemeNeonOrange', 'Neon Orange')
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
                  t(
                    'schemaCaptureBehaviorSidebarHighlightsNote',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureBehaviorSidebarHighlightsNote
                  ).replace(
                    'Sidebar Highlights',
                    '<a href="https://github.com/trevware/obsidian-sidebar-highlights" target="_blank" rel="noopener noreferrer">Sidebar Highlights</a>'
                  ),
                  'option-support-note'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: t('schemaCaptureBehaviorFragmentGroupTitle', 'Fragment Clipper'),
          children: [
            {
              kind: 'card',
              title: t('fragmentConfigTitle', 'Fragment Interaction Model'),
              description: t(
                'fragmentConfigHint',
                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentConfigHint
              ),
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: t(
                        'schemaCaptureBehaviorCaptureContextTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureBehaviorCaptureContextTitle
                      ),
                      description: t(
                        'fragmentCaptureContextHint',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentCaptureContextHint
                      ),
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
                            label: t(
                              'schemaCaptureBehaviorContextLengthFieldLabel',
                              'contextLength'
                            ),
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
                            label: t('schemaCaptureBehaviorContextModeFieldLabel', 'contextMode'),
                            control: boundSelect({
                              bind: 'fragmentContextMode',
                              options: [
                                {
                                  value: 'chars',
                                  label: t('schemaCaptureBehaviorContextModeCharsOption', 'chars')
                                },
                                {
                                  value: 'sentences',
                                  label: t(
                                    'schemaCaptureBehaviorContextModeSentencesOption',
                                    'sentences'
                                  )
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
                      title: t(
                        'fragmentModifierToggleLabel',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentModifierToggleLabel
                      ),
                      description: t(
                        'fragmentModifierToggleDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentModifierToggleDescription
                      ),
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
                            fragmentModifierStateWarning(current.state, current.messages),
                            'modifier-key-warning'
                          )
                        ],
                        'switch-line modifier-key-inline'
                      )
                    },
                    {
                      kind: 'row',
                      title: t(
                        'fragmentKeyboardShortcutsLabel',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentKeyboardShortcutsLabel
                      ),
                      description: t(
                        'fragmentKeyboardShortcutsHint',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentKeyboardShortcutsHint
                      ),
                      control: boundSwitch({
                        bind: 'fragmentKeyboardShortcutsEnabled',
                        stateText: (current) =>
                          current.state.fragmentKeyboardShortcutsEnabled
                            ? translate(
                                current,
                                'schemaCommonEnabledState',
                                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCommonEnabledState
                              )
                            : translate(
                                current,
                                'schemaCommonDisabledState',
                                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCommonDisabledState
                              ),
                        onChange: {
                          id: 'options:updateField',
                          args: ['fragmentClipper.keyboardShortcutsEnabled'],
                          valueFrom: 'target.checked'
                        }
                      })
                    }
                  ]
                },
                grid(
                  2,
                  [
                    {
                      kind: 'miniCard',
                      title: t(
                        'fragmentFootnoteExampleTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentFootnoteExampleTitle
                      ),
                      content: htmlParagraph(
                        `${t(
                          'fragmentFootnoteExampleContent',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentFootnoteExampleContent
                        )}[^1]<br><br>[^1]: ${t(
                          'fragmentFootnoteExampleComment',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentFootnoteExampleComment
                        )}`,
                        'mono'
                      )
                    },
                    {
                      kind: 'miniCard',
                      title: t(
                        'fragmentContextHighlightExampleTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentContextHighlightExampleTitle
                      ),
                      content: paragraph(
                        t(
                          'fragmentContextHighlightExampleContent',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentContextHighlightExampleContent
                        ),
                        'mono'
                      )
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
