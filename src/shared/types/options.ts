import type {
  CompleteOptions as SchemaCompleteOptions,
  StoredOptions as SchemaStoredOptions
} from '../schemas/options.schema';

export type StoredOptions = SchemaStoredOptions;
export type CompleteOptions = SchemaCompleteOptions;
export type RestOptions = CompleteOptions['rest'];
export type TemplateOptions = CompleteOptions['templates'];
export type AiChatOptions = CompleteOptions['aiChat'];
export type DeepResearchOptions = CompleteOptions['deepResearch'];
export type FragmentClipperOptions = CompleteOptions['fragmentClipper'];
export type FragmentContextMode = FragmentClipperOptions['contextMode'];
export type FragmentModifierKey = FragmentClipperOptions['selectionModifierKeys'][number];
export type FragmentSelectionTriggerMode = FragmentClipperOptions['selectionTriggerMode'];
export type ReadingSessionOptions = CompleteOptions['readingSession'];
export type ReadingExportMode = ReadingSessionOptions['exportMode'];
export type ReaderHighlightTheme = ReadingSessionOptions['highlightTheme'];
export type VideoOptions = CompleteOptions['video'];
export type VideoScreenshotAttachmentOptions = VideoOptions['screenshotAttachment'];
export type ClassifierOptions = CompleteOptions['classifier'];
export type ClassifierProvider = ClassifierOptions['provider'];
export type ExperimentalAiOptions = CompleteOptions['experimentalAi'];
export type PageSummaryOptions = CompleteOptions['pageSummary'];
export type ReadingOverlaySummaryOptions = CompleteOptions['readingOverlaySummary'];
export type SubtitleTranslationOptions = CompleteOptions['subtitleTranslation'];
export type PrivacyPreferencesOptions = CompleteOptions['privacyPreferences'];
export type InterfaceTheme = NonNullable<CompleteOptions['interfaceTheme']>;
export type StoredVideoOptions = NonNullable<StoredOptions['video']>;

type RequiredRuntimeOptions = Pick<CompleteOptions, 'rest' | 'templates' | 'domainMappings'>;
type OptionalRuntimeOptions = Partial<Omit<CompleteOptions, keyof RequiredRuntimeOptions>>;

export type OptionsState = RequiredRuntimeOptions & OptionalRuntimeOptions;
