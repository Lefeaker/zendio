import type { Messages } from '@i18n';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import {
  FragmentContextModeSchema,
  FragmentModifierKeySchema,
  FragmentSelectionTriggerModeSchema,
  InterfaceThemeSchema,
  ReaderHighlightThemeSchema,
  ReadingExportModeSchema
} from '@shared/schemas/options.schema';
import { readOptionsPath, type OptionsPath } from '../state/optionsPatchModel';

export type AiConfigField = {
  path: OptionsPath;
  label: keyof Messages;
  hint: keyof Messages;
  choices?: readonly string[];
};
const field = (
  path: OptionsPath,
  label: keyof Messages,
  hint: keyof Messages,
  choices?: readonly string[]
): AiConfigField => ({ path, label, hint, ...(choices ? { choices } : {}) });

/** Only currently supported controls. Credentials, consent and runtime state are deliberately absent. */
export const AI_CONFIG_FIELDS: AiConfigField[] = [
  field(
    ['interfaceTheme'],
    'schemaOverviewThemeRowTitle',
    'schemaOverviewHeroDescription',
    InterfaceThemeSchema.options
  ),
  field(['templates', 'article'], 'articleTemplateLabel', 'articleTemplateHint'),
  field(['templates', 'video'], 'videoTemplateLabel', 'videoTemplateHint'),
  field(['templates', 'fragment'], 'fragmentTemplateLabel', 'fragmentTemplateHint'),
  field(['templates', 'reading'], 'readingTemplateLabel', 'readingTemplateHint'),
  field(['templates', 'ai'], 'aiTemplateLabel', 'aiTemplateHint'),
  field(
    ['readingSession', 'exportMode'],
    'readingExportModeLabel',
    'readingExportModeDescription',
    ReadingExportModeSchema.options
  ),
  field(
    ['readingSession', 'highlightTheme'],
    'readingHighlightThemeLabel',
    'readingHighlightThemeDescription',
    ReaderHighlightThemeSchema.options
  ),
  field(
    ['fragmentClipper', 'captureContext'],
    'schemaCaptureBehaviorCaptureContextTitle',
    'fragmentCaptureContextHint'
  ),
  field(
    ['fragmentClipper', 'contextLength'],
    'schemaCaptureBehaviorContextLengthFieldLabel',
    'fragmentCaptureContextHint'
  ),
  field(
    ['fragmentClipper', 'contextMode'],
    'schemaCaptureBehaviorContextModeFieldLabel',
    'fragmentCaptureContextHint',
    FragmentContextModeSchema.options
  ),
  field(
    ['fragmentClipper', 'selectionTriggerMode'],
    'fragmentSelectionTriggerModeLabel',
    'fragmentSelectionTriggerModeDescription',
    FragmentSelectionTriggerModeSchema.options
  ),
  field(
    ['fragmentClipper', 'selectionModifierKeys'],
    'fragmentSelectionTriggerModeModifier',
    'fragmentSelectionTriggerModeDescription',
    FragmentModifierKeySchema.options
  ),
  field(
    ['fragmentClipper', 'keyboardShortcutsEnabled'],
    'fragmentKeyboardShortcutsLabel',
    'fragmentSelectionTriggerModeDescription'
  ),
  field(['video', 'floatingPromptEnabled'], 'videoFloatingPromptLabel', 'videoFloatingPromptHint'),
  field(
    ['video', 'commentEditorAutoPause'],
    'schemaCaptureSourcesAutoPauseTitle',
    'schemaCaptureSourcesVideoEntryBehaviorDescription'
  ),
  field(
    ['video', 'screenshotAttachment', 'locationTemplate'],
    'schemaCaptureSourcesScreenshotLocationTitle',
    'schemaCaptureSourcesScreenshotLocationDescription'
  ),
  field(
    ['video', 'screenshotAttachment', 'fileNameTemplate'],
    'schemaCaptureSourcesScreenshotFilenameTitle',
    'schemaCaptureSourcesScreenshotFilenameDescription'
  ),
  field(
    ['video', 'screenshotAttachment', 'markdownUrlFormat'],
    'schemaCaptureSourcesMarkdownUrlTitle',
    'schemaCaptureSourcesMarkdownUrlDescription'
  )
];

export const AI_CONFIG_VALUE_LABELS: Record<string, Record<string, keyof Messages>> = {
  interfaceTheme: {
    light: 'schemaOverviewThemeLightOption',
    dark: 'schemaOverviewThemeDarkOption',
    system: 'schemaOverviewThemeSystemOption'
  },
  'readingSession.exportMode': {
    highlights: 'readingExportModeHighlights',
    full: 'readingExportModeFull'
  },
  'readingSession.highlightTheme': {
    gradient: 'readingHighlightThemeGradient',
    purple: 'readingHighlightThemePurple',
    neonYellow: 'readingHighlightThemeNeonYellow',
    neonGreen: 'readingHighlightThemeNeonGreen',
    neonOrange: 'readingHighlightThemeNeonOrange'
  },
  'fragmentClipper.contextMode': {
    chars: 'schemaCaptureBehaviorContextModeCharsOption',
    sentences: 'schemaCaptureBehaviorContextModeSentencesOption'
  },
  'fragmentClipper.selectionTriggerMode': {
    disabled: 'fragmentSelectionTriggerModeDisabled',
    direct: 'fragmentSelectionTriggerModeDirect',
    modifier: 'fragmentSelectionTriggerModeModifier'
  }
};

export function aiConfigFieldDictionary(m: Messages) {
  return Object.fromEntries(
    AI_CONFIG_FIELDS.map((entry) => {
      const value = readOptionsPath(DEFAULT_OPTIONS, entry.path);
      return [
        entry.path.join('.'),
        {
          label: m[entry.label],
          description: m[entry.hint],
          type: Array.isArray(value) ? 'array' : typeof value,
          default: value,
          ...(entry.choices ? { allowed: entry.choices } : {}),
          ...(AI_CONFIG_VALUE_LABELS[entry.path.join('.')]
            ? {
                valueLabels: Object.fromEntries(
                  Object.entries(AI_CONFIG_VALUE_LABELS[entry.path.join('.')] ?? {}).map(
                    ([value, label]) => [value, m[label]]
                  )
                )
              }
            : {}),
          ...(entry.path[1] === 'selectionModifierKeys' ? { length: 1 } : {}),
          ...(entry.path[1] === 'contextLength' ? { integer: true, minimum: 1 } : {})
        }
      ];
    })
  );
}
