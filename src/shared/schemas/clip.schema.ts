import { z } from 'zod';
import { ClassificationResultSchema } from './classification.schema';
import { AppErrorSchema } from './error.schema';

/**
 * Clip meta schema with common optional URL-related fields.
 * Keep permissive with passthrough to preserve behavior.
 */
export const ClipMetaSchema = z
  .object({
    url: z.string().optional(),
    domain: z.string().optional(),
    platform: z.string().optional(),
    sourceUrl: z.string().optional(),
    resolvedUrl: z.string().optional()
  })
  .passthrough();

/**
 * Clip payload schema used across the clip boundary.
 * Only `markdown` is required; everything else remains optional.
 */
export const ClipPayloadSchema = z
  .object({
    markdown: z.string().min(1),
    title: z.string().optional(),
    type: z.string().optional(),
    meta: ClipMetaSchema.optional()
  })
  .passthrough();

/**
 * ClipProcessingResult Schema
 * 解决 src/background/application/clipProcessor.ts:40 的 any 类型问题
 */
export const ClipProcessingResultSchema = z.object({
  filePath: z.string(),
  restVault: z.string(),
  destination: z.enum(['vault', 'downloads']).optional(),
  classification: ClassificationResultSchema,
  vaultName: z.string().optional(),
  classificationWarning: AppErrorSchema.optional()
});

export type ClipProcessingResult = z.infer<typeof ClipProcessingResultSchema>;
export type ClipPayloadShape = z.infer<typeof ClipPayloadSchema>;
