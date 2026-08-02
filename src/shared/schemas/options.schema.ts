import { z } from 'zod';
import { TaxonomyConfigSchema } from './taxonomy.schema';
import { VaultRouterConfigSchema } from './vault.schema';
import { YamlConfigOverridesSchema } from './yamlConfig.schema';

export const RestOptionsSchema = z.strictObject({
  baseUrl: z.string().url('Must be a valid URL'),
  httpsUrl: z.string().url().optional(),
  httpUrl: z.string().url().optional(),
  vault: z.string().min(1, 'Vault name is required'),
  apiKey: z.union([z.literal(''), z.string().min(10, 'API key must be at least 10 characters')]),
  localFolderId: z.string().optional(),
  localFolderName: z.string().optional()
});
export const RestOptionsReadinessSchema = RestOptionsSchema.extend({
  apiKey: z.string().min(10, 'API key must be at least 10 characters')
});

/**
 * TemplateOptions Schema
 */
export const TemplateOptionsSchema = z.strictObject({
  article: z.string(),
  video: z.string(),
  fragment: z.string(),
  reading: z.string(),
  ai: z.string()
});

/**
 * AiChatOptions Schema
 */
export const AiChatOptionsSchema = z.strictObject({
  includeTimestamps: z.boolean(),
  userName: z.string()
});

/**
 * DeepResearchOptions Schema
 */
export const DeepResearchOptionsSchema = z.strictObject({
  pureMode: z.boolean()
});

/**
 * FragmentContextMode Schema
 */
export const FragmentContextModeSchema = z.enum(['chars', 'sentences']);

/**
 * FragmentModifierKey Schema
 */
export const FragmentModifierKeySchema = z.enum(['alt', 'meta', 'ctrl', 'shift']);
export const FragmentSelectionTriggerModeSchema = z.enum(['disabled', 'direct', 'modifier']);

/**
 * ReadingExportMode Schema
 */
export const ReadingExportModeSchema = z.enum(['highlights', 'full']);

/**
 * ReaderHighlightTheme Schema
 */
export const ReaderHighlightThemeSchema = z.enum([
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
]);

/**
 * ReadingSessionOptions Schema
 */
export const ReadingSessionOptionsSchema = z.strictObject({
  exportMode: ReadingExportModeSchema,
  highlightTheme: ReaderHighlightThemeSchema
});

export const VideoScreenshotAttachmentOptionsSchema = z.strictObject({
  locationTemplate: z.string(),
  fileNameTemplate: z.string(),
  markdownUrlFormat: z.string()
});

/**
 * VideoOptions Schema
 */
export const VideoOptionsSchema = z.strictObject({
  floatingPromptEnabled: z.boolean(),
  promptButtonLabel: z.string().min(1),
  promptShortcut: z.string().min(1),
  controlBarAutoPause: z.boolean().optional(),
  controlBarScreenshot: z.boolean().optional(),
  commentEditorAutoPause: z.boolean().optional(),
  promptPosition: z
    .strictObject({
      x: z.number(),
      y: z.number()
    })
    .optional(),
  screenshotAttachment: VideoScreenshotAttachmentOptionsSchema
});

/**
 * FragmentClipperOptions Schema
 */
export const FragmentClipperOptionsSchema = z.strictObject({
  useFootnoteFormat: z.boolean(),
  captureContext: z.boolean(),
  contextLength: z.number().int().positive(),
  contextMode: FragmentContextModeSchema,
  selectionTriggerMode: FragmentSelectionTriggerModeSchema,
  selectionModifierKeys: z.array(FragmentModifierKeySchema),
  keyboardShortcutsEnabled: z.boolean()
});

/**
 * ClassifierProvider Schema
 */
export const ClassifierProviderSchema = z.enum(['openai', 'compatible', 'ollama']);

/**
 * ClassifierOptions Schema
 */
export const ClassifierOptionsSchema = z.strictObject({
  enabled: z.boolean(),
  provider: ClassifierProviderSchema,
  endpoint: z.string().url(),
  apiKey: z.string(),
  model: z.string(),
  taxonomy: TaxonomyConfigSchema
});

export const ExperimentalAiOptionsSchema = z.strictObject({
  provider: z.string().min(1),
  model: z.string().min(1),
  apiUrl: z.string().url(),
  apiKey: z.string()
});

export const PageSummaryOptionsSchema = z.strictObject({
  enabled: z.boolean()
});

export const ReadingOverlaySummaryOptionsSchema = z.strictObject({
  enabled: z.boolean()
});

export const SubtitleTranslationOptionsSchema = z.strictObject({
  enabled: z.boolean(),
  targetLanguage: z.string().min(1)
});

export const PrivacyPreferencesOptionsSchema = z.strictObject({
  analytics: z.boolean(),
  errorReporting: z.boolean(),
  debugMode: z.boolean()
});

export const InterfaceThemeSchema = z.enum(['dark', 'light', 'system']);

/**
 * StoredOptions Schema（用于 chrome.storage 存储）
 *
 * Unknown root keys are rejected at the canonical boundary. Config transfer and
 * the loss-aware codec preserve opaque raw data separately from runtime options.
 */
export const StoredOptionsSchema = z
  .object({
    interfaceTheme: InterfaceThemeSchema.optional(),
    rest: RestOptionsSchema.partial().optional(),
    templates: TemplateOptionsSchema.partial()
      .extend({
        fragment: z.string().optional(),
        reading: z.string().optional()
      })
      .optional(),
    domainMappings: z.record(z.string()).optional(),
    aiChat: AiChatOptionsSchema.partial().optional(),
    deepResearch: DeepResearchOptionsSchema.partial().optional(),
    fragmentClipper: FragmentClipperOptionsSchema.partial().optional(),
    readingSession: ReadingSessionOptionsSchema.partial().optional(),
    video: VideoOptionsSchema.partial()
      .extend({
        screenshotAttachment: VideoScreenshotAttachmentOptionsSchema.partial().optional()
      })
      .optional(),
    classifier: ClassifierOptionsSchema.partial().optional(),
    experimentalAi: ExperimentalAiOptionsSchema.partial().optional(),
    pageSummary: PageSummaryOptionsSchema.partial().optional(),
    readingOverlaySummary: ReadingOverlaySummaryOptionsSchema.partial().optional(),
    subtitleTranslation: SubtitleTranslationOptionsSchema.partial().optional(),
    privacyPreferences: PrivacyPreferencesOptionsSchema.partial().optional(),
    vaultRouter: VaultRouterConfigSchema.optional(),
    yamlConfig: YamlConfigOverridesSchema.nullable().optional()
  })
  .strict();

/**
 * CompleteOptions Schema（合并默认值后的完整配置）
 */
export const CompleteOptionsSchema = z.strictObject({
  interfaceTheme: InterfaceThemeSchema.optional(),
  rest: RestOptionsSchema,
  templates: TemplateOptionsSchema,
  aiChat: AiChatOptionsSchema,
  deepResearch: DeepResearchOptionsSchema,
  fragmentClipper: FragmentClipperOptionsSchema,
  readingSession: ReadingSessionOptionsSchema,
  video: VideoOptionsSchema,
  classifier: ClassifierOptionsSchema,
  experimentalAi: ExperimentalAiOptionsSchema,
  pageSummary: PageSummaryOptionsSchema,
  readingOverlaySummary: ReadingOverlaySummaryOptionsSchema,
  subtitleTranslation: SubtitleTranslationOptionsSchema,
  privacyPreferences: PrivacyPreferencesOptionsSchema,
  domainMappings: z.record(z.string())
});

/**
 * 自动生成 TypeScript 类型（替换手写类型）
 */
export type RestOptions = z.infer<typeof RestOptionsSchema>;
export type TemplateOptions = z.infer<typeof TemplateOptionsSchema>;
export type AiChatOptions = z.infer<typeof AiChatOptionsSchema>;
export type DeepResearchOptions = z.infer<typeof DeepResearchOptionsSchema>;
export type FragmentContextMode = z.infer<typeof FragmentContextModeSchema>;
export type FragmentModifierKey = z.infer<typeof FragmentModifierKeySchema>;
export type FragmentSelectionTriggerMode = z.infer<typeof FragmentSelectionTriggerModeSchema>;
export type ReadingExportMode = z.infer<typeof ReadingExportModeSchema>;
export type ReaderHighlightTheme = z.infer<typeof ReaderHighlightThemeSchema>;
export type ReadingSessionOptions = z.infer<typeof ReadingSessionOptionsSchema>;
export type VideoScreenshotAttachmentOptions = z.infer<
  typeof VideoScreenshotAttachmentOptionsSchema
>;
export type VideoOptions = z.infer<typeof VideoOptionsSchema>;
export type FragmentClipperOptions = z.infer<typeof FragmentClipperOptionsSchema>;
export type ClassifierProvider = z.infer<typeof ClassifierProviderSchema>;
export type ClassifierOptions = z.infer<typeof ClassifierOptionsSchema>;
export type ExperimentalAiOptions = z.infer<typeof ExperimentalAiOptionsSchema>;
export type PageSummaryOptions = z.infer<typeof PageSummaryOptionsSchema>;
export type ReadingOverlaySummaryOptions = z.infer<typeof ReadingOverlaySummaryOptionsSchema>;
export type SubtitleTranslationOptions = z.infer<typeof SubtitleTranslationOptionsSchema>;
export type PrivacyPreferencesOptions = z.infer<typeof PrivacyPreferencesOptionsSchema>;
export type InterfaceTheme = z.infer<typeof InterfaceThemeSchema>;
export type StoredOptions = z.infer<typeof StoredOptionsSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
