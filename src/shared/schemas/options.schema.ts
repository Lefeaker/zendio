import { z } from 'zod';
import { exactOptionalSchema, schemaOutput, TaxonomyConfigSchema } from './taxonomy.schema';
import { VaultRouterConfigSchema } from './vault.schema';
import { YamlConfigOverridesSchema } from './yamlConfig.schema';
import type { VaultRouterConfig } from '../types/vault';
import type { YamlConfigOverrides } from '../types/yamlConfig';

export const RestOptionsSchema = z.strictObject({
  baseUrl: z.string().url('Must be a valid URL'),
  httpsUrl: z.string().url().optional(),
  httpUrl: z.string().url().optional(),
  vault: z.string().min(1, 'Vault name is required'),
  apiKey: z.string(),
  localFolderId: z.string().optional(),
  localFolderName: z.string().optional()
});
export const RestOptionsReadinessSchema = RestOptionsSchema.extend({
  apiKey: z.string().min(10, 'API key must be at least 10 characters')
});

export const TemplateOptionsSchema = z.strictObject({
  article: z.string(),
  video: z.string(),
  fragment: z.string(),
  reading: z.string(),
  ai: z.string()
});

export const AiChatOptionsSchema = z.strictObject({
  includeTimestamps: z.boolean(),
  userName: z.string()
});

export const DeepResearchOptionsSchema = z.strictObject({
  pureMode: z.boolean()
});

export const FragmentContextModeSchema = z.enum(['chars', 'sentences']);

export const FragmentModifierKeySchema = z.enum(['alt', 'meta', 'ctrl', 'shift']);
export const FragmentSelectionTriggerModeSchema = z.enum(['disabled', 'direct', 'modifier']);

export const ReadingExportModeSchema = z.enum(['highlights', 'full']);

export const ReaderHighlightThemeSchema = z.enum([
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
]);

export const ReadingSessionOptionsSchema = z.strictObject({
  exportMode: ReadingExportModeSchema,
  highlightTheme: ReaderHighlightThemeSchema
});

export const VideoScreenshotAttachmentOptionsSchema = z.strictObject({
  locationTemplate: z.string(),
  fileNameTemplate: z.string(),
  markdownUrlFormat: z.string()
});

export const VideoOptionsSchema = z.strictObject({
  floatingPromptEnabled: z.boolean(),
  promptButtonLabel: z.string().min(1),
  promptShortcut: z.string().min(1),
  controlBarAutoPause: z.boolean(),
  controlBarScreenshot: z.boolean(),
  commentEditorAutoPause: z.boolean(),
  promptPosition: z
    .strictObject({
      x: z.number(),
      y: z.number()
    })
    .optional(),
  screenshotAttachment: VideoScreenshotAttachmentOptionsSchema
});

export const FragmentClipperOptionsSchema = z.strictObject({
  useFootnoteFormat: z.boolean(),
  captureContext: z.boolean(),
  contextLength: z.number().int().positive(),
  contextMode: FragmentContextModeSchema,
  selectionTriggerMode: FragmentSelectionTriggerModeSchema,
  selectionModifierKeys: z.array(FragmentModifierKeySchema),
  keyboardShortcutsEnabled: z.boolean()
});

export const ClassifierProviderSchema = z.enum(['openai', 'compatible', 'ollama']);

export const ClassifierOptionsSchema = z.strictObject({
  enabled: z.boolean(),
  provider: ClassifierProviderSchema,
  endpoint: z.string().url(),
  apiKey: z.string(),
  model: z.string(),
  timeoutMs: z.number().finite().positive().optional(),
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

const CompleteRestOptionsSchema = RestOptionsSchema.transform((value) => ({
  baseUrl: value.baseUrl,
  vault: value.vault,
  apiKey: value.apiKey,
  ...(value.httpsUrl !== undefined && { httpsUrl: value.httpsUrl }),
  ...(value.httpUrl !== undefined && { httpUrl: value.httpUrl }),
  ...('localFolderId' in value && { localFolderId: value.localFolderId }),
  ...('localFolderName' in value && { localFolderName: value.localFolderName })
}));

const CompleteVideoOptionsSchema = exactOptionalSchema(VideoOptionsSchema);
const CompleteClassifierOptionsSchema = exactOptionalSchema(ClassifierOptionsSchema);

const StoredRestOptionsSchema = RestOptionsSchema.partial().transform((value) => ({
  ...(value.baseUrl !== undefined && { baseUrl: value.baseUrl }),
  ...(value.httpsUrl !== undefined && { httpsUrl: value.httpsUrl }),
  ...(value.httpUrl !== undefined && { httpUrl: value.httpUrl }),
  ...(value.vault !== undefined && { vault: value.vault }),
  ...(value.apiKey !== undefined && { apiKey: value.apiKey }),
  ...('localFolderId' in value && { localFolderId: value.localFolderId }),
  ...('localFolderName' in value && { localFolderName: value.localFolderName })
}));

const StoredTemplateOptionsSchema = exactOptionalSchema(TemplateOptionsSchema.partial());
const StoredAiChatOptionsSchema = exactOptionalSchema(AiChatOptionsSchema.partial());
const StoredDeepResearchOptionsSchema = exactOptionalSchema(DeepResearchOptionsSchema.partial());
const StoredFragmentClipperOptionsSchema = exactOptionalSchema(
  FragmentClipperOptionsSchema.partial()
);
const StoredReadingSessionOptionsSchema = exactOptionalSchema(
  ReadingSessionOptionsSchema.partial()
);
const StoredVideoScreenshotAttachmentOptionsSchema = exactOptionalSchema(
  VideoScreenshotAttachmentOptionsSchema.partial()
);

const StoredVideoOptionsObjectSchema = VideoOptionsSchema.partial().extend({
  screenshotAttachment: StoredVideoScreenshotAttachmentOptionsSchema.optional()
});
const StoredVideoOptionsSchema = exactOptionalSchema(StoredVideoOptionsObjectSchema);
const StoredClassifierOptionsSchema = exactOptionalSchema(ClassifierOptionsSchema.partial());
const StoredExperimentalAiOptionsSchema = exactOptionalSchema(
  ExperimentalAiOptionsSchema.partial()
);
const StoredPageSummaryOptionsSchema = exactOptionalSchema(PageSummaryOptionsSchema.partial());
const StoredReadingOverlaySummaryOptionsSchema = exactOptionalSchema(
  ReadingOverlaySummaryOptionsSchema.partial()
);
const StoredSubtitleTranslationOptionsSchema = exactOptionalSchema(
  SubtitleTranslationOptionsSchema.partial()
);
const StoredPrivacyPreferencesOptionsSchema = exactOptionalSchema(
  PrivacyPreferencesOptionsSchema.partial()
);

export const OptionsVaultRouterConfigSchema = VaultRouterConfigSchema.transform((config) =>
  schemaOutput<VaultRouterConfig>(config)
);
export const OptionsYamlConfigOverridesSchema = YamlConfigOverridesSchema.transform((config) =>
  schemaOutput<YamlConfigOverrides>(config)
);

/**
 * StoredOptions Schema（用于 chrome.storage 存储）
 *
 * Unknown root keys are rejected at the canonical boundary. Config transfer and
 * the loss-aware codec preserve opaque raw data separately from runtime options.
 */
export const StoredOptionsSchema = z
  .object({
    interfaceTheme: InterfaceThemeSchema.optional(),
    rest: StoredRestOptionsSchema.optional(),
    templates: StoredTemplateOptionsSchema.optional(),
    domainMappings: z.record(z.string()).optional(),
    aiChat: StoredAiChatOptionsSchema.optional(),
    deepResearch: StoredDeepResearchOptionsSchema.optional(),
    fragmentClipper: StoredFragmentClipperOptionsSchema.optional(),
    readingSession: StoredReadingSessionOptionsSchema.optional(),
    video: StoredVideoOptionsSchema.optional(),
    classifier: StoredClassifierOptionsSchema.optional(),
    experimentalAi: StoredExperimentalAiOptionsSchema.optional(),
    pageSummary: StoredPageSummaryOptionsSchema.optional(),
    readingOverlaySummary: StoredReadingOverlaySummaryOptionsSchema.optional(),
    subtitleTranslation: StoredSubtitleTranslationOptionsSchema.optional(),
    privacyPreferences: StoredPrivacyPreferencesOptionsSchema.optional(),
    vaultRouter: OptionsVaultRouterConfigSchema.optional(),
    yamlConfig: OptionsYamlConfigOverridesSchema.nullable().optional()
  })
  .strict();

/**
 * CompleteOptions Schema（合并默认值后的完整配置）
 */
export const CompleteOptionsSchema = z.strictObject({
  interfaceTheme: InterfaceThemeSchema.optional(),
  rest: CompleteRestOptionsSchema,
  templates: TemplateOptionsSchema,
  aiChat: AiChatOptionsSchema,
  deepResearch: DeepResearchOptionsSchema,
  fragmentClipper: FragmentClipperOptionsSchema,
  readingSession: ReadingSessionOptionsSchema,
  video: CompleteVideoOptionsSchema,
  classifier: CompleteClassifierOptionsSchema,
  experimentalAi: ExperimentalAiOptionsSchema,
  pageSummary: PageSummaryOptionsSchema,
  readingOverlaySummary: ReadingOverlaySummaryOptionsSchema,
  subtitleTranslation: SubtitleTranslationOptionsSchema,
  privacyPreferences: PrivacyPreferencesOptionsSchema,
  domainMappings: z.record(z.string()),
  vaultRouter: OptionsVaultRouterConfigSchema.optional(),
  yamlConfig: OptionsYamlConfigOverridesSchema.nullable().optional()
});

export type StoredOptions = z.infer<typeof StoredOptionsSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
