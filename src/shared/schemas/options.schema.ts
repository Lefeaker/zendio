import { z } from 'zod';
import { VaultRouterConfigSchema } from './vault.schema';
import { YamlConfigOverridesSchema } from './yamlConfig.schema';

/**
 * RestOptions Schema
 * 替换 src/shared/types/options.ts 中的 RestOptions 接口
 */
export const RestOptionsSchema = z.object({
  baseUrl: z.string().url('必须是有效的 URL'),
  httpsUrl: z.string().url().optional(),
  httpUrl: z.string().url().optional(),
  vault: z.string().min(1, 'Vault 名称不能为空'),
  apiKey: z.string().min(10, 'API Key 至少需要 10 个字符'),
  rootDir: z.string().optional()
});

/**
 * TemplateOptions Schema
 */
export const TemplateOptionsSchema = z.object({
  article: z.string(),
  fragment: z.string(),
  reading: z.string(),
  ai: z.string()
});

/**
 * AiChatOptions Schema
 */
export const AiChatOptionsSchema = z.object({
  includeTimestamps: z.boolean(),
  userName: z.string()
});

/**
 * DeepResearchOptions Schema
 */
export const DeepResearchOptionsSchema = z.object({
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
export const ReadingSessionOptionsSchema = z.object({
  exportMode: ReadingExportModeSchema,
  highlightTheme: ReaderHighlightThemeSchema
});

/**
 * VideoOptions Schema
 */
export const VideoOptionsSchema = z.object({
  floatingPromptEnabled: z.boolean(),
  promptButtonLabel: z.string().min(1),
  promptShortcut: z.string().min(1)
});

/**
 * FragmentClipperOptions Schema
 */
export const FragmentClipperOptionsSchema = z.object({
  useFootnoteFormat: z.boolean(),
  captureContext: z.boolean(),
  contextLength: z.number().int().positive(),
  contextMode: FragmentContextModeSchema,
  selectionModifierEnabled: z.boolean(),
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
export const ClassifierOptionsSchema = z.object({
  enabled: z.boolean(),
  provider: ClassifierProviderSchema,
  endpoint: z.string().url(),
  apiKey: z.string(),
  model: z.string(),
  taxonomy: z.any()
});

/**
 * StoredOptions Schema（用于 chrome.storage 存储）
 */
export const StoredOptionsSchema = z.object({
  rest: RestOptionsSchema.partial().extend({ baseUrl: z.string().optional() }).optional(),
  templates: TemplateOptionsSchema.partial().extend({
    fragment: z.string().optional(),
    reading: z.string().optional()
  }).optional(),
  domainMappings: z.record(z.string()).optional(),
  aiChat: AiChatOptionsSchema.partial().optional(),
  deepResearch: DeepResearchOptionsSchema.partial().optional(),
  fragmentClipper: FragmentClipperOptionsSchema.partial().optional(),
  readingSession: ReadingSessionOptionsSchema.partial().optional(),
  video: VideoOptionsSchema.partial().optional(),
  classifier: ClassifierOptionsSchema.partial().optional(),
  vaultRouter: VaultRouterConfigSchema.optional(),
  yamlConfig: YamlConfigOverridesSchema.nullable().optional()
}).passthrough();

/**
 * CompleteOptions Schema（合并默认值后的完整配置）
 */
export const CompleteOptionsSchema = z.object({
  rest: RestOptionsSchema,
  templates: TemplateOptionsSchema,
  aiChat: AiChatOptionsSchema,
  deepResearch: DeepResearchOptionsSchema,
  fragmentClipper: FragmentClipperOptionsSchema,
  readingSession: ReadingSessionOptionsSchema,
  video: VideoOptionsSchema,
  classifier: ClassifierOptionsSchema,
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
export type ReadingExportMode = z.infer<typeof ReadingExportModeSchema>;
export type ReaderHighlightTheme = z.infer<typeof ReaderHighlightThemeSchema>;
export type ReadingSessionOptions = z.infer<typeof ReadingSessionOptionsSchema>;
export type VideoOptions = z.infer<typeof VideoOptionsSchema>;
export type FragmentClipperOptions = z.infer<typeof FragmentClipperOptionsSchema>;
export type ClassifierProvider = z.infer<typeof ClassifierProviderSchema>;
export type ClassifierOptions = z.infer<typeof ClassifierOptionsSchema>;
export type StoredOptions = z.infer<typeof StoredOptionsSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
