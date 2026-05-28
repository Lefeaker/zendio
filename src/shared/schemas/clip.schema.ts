import { z } from 'zod';
import { ClassificationResultSchema } from './classification.schema';
import { AppErrorSchema } from './error.schema';

const MAX_META_STRING_LENGTH = 4096;
const MAX_PREVIEW_LENGTH = 512;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 20 * 1024 * 1024;

const BoundedMetaStringSchema = z.string().max(MAX_META_STRING_LENGTH);
const NonNegativeIntegerSchema = z.number().int().nonnegative();

const ClipAttachmentSchema = z
  .object({
    id: z.string().min(1).max(256),
    fileName: z.string().min(1).max(512),
    mimeType: z.string().min(1).max(128),
    dataUrl: z.string().min(1).max(MAX_ATTACHMENT_DATA_URL_LENGTH)
  })
  .strip();

const ExportDestinationSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('downloads') }).strip(),
    z
      .object({
        kind: z.literal('vault'),
        vaultId: z.string().min(1).max(256).optional()
      })
      .strip()
  ])
  .optional();

export const ClipMetaSchema = z
  .object({
    url: BoundedMetaStringSchema.optional(),
    domain: BoundedMetaStringSchema.optional(),
    platform: BoundedMetaStringSchema.optional(),
    sourceUrl: BoundedMetaStringSchema.optional(),
    resolvedUrl: BoundedMetaStringSchema.optional(),
    clippedAtISO: BoundedMetaStringSchema.optional(),
    fragmentUrl: BoundedMetaStringSchema.optional(),
    hasComment: z.boolean().optional(),
    selectedTextPreview: z.string().max(MAX_PREVIEW_LENGTH).optional(),
    model: BoundedMetaStringSchema.optional(),
    messageCount: NonNegativeIntegerSchema.optional(),
    createdAt: BoundedMetaStringSchema.optional(),
    readerMode: z.boolean().optional(),
    exportMode: z.enum(['highlights', 'full']).optional(),
    highlightCount: NonNegativeIntegerSchema.optional(),
    commentCount: NonNegativeIntegerSchema.optional(),
    fragmentUrls: z.array(BoundedMetaStringSchema).max(200).optional(),
    captureCount: NonNegativeIntegerSchema.optional(),
    timestampCount: NonNegativeIntegerSchema.optional(),
    fragmentCount: NonNegativeIntegerSchema.optional(),
    storageKey: z.string().min(1).max(512).optional(),
    attachments: z.array(ClipAttachmentSchema).max(50).optional(),
    exportDestination: ExportDestinationSchema
  })
  .strip();

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
  .strip();

/**
 * ClipProcessingResult Schema
 * 解决 src/background/application/clipProcessor.ts:40 的 any 类型问题
 */
export const ClipProcessingResultSchema = z.object({
  filePath: z.string(),
  restVault: z.string(),
  destination: z.enum(['vault', 'downloads']).optional(),
  storageTarget: z.enum(['local-folder', 'rest-api', 'downloads']),
  localFolderName: z.string().optional(),
  fallbackReason: z
    .enum(['permission-denied', 'folder-missing', 'unsupported', 'write-preflight-failed'])
    .optional(),
  classification: ClassificationResultSchema,
  vaultName: z.string().optional(),
  classificationWarning: AppErrorSchema.optional()
});

export type ClipProcessingResult = z.infer<typeof ClipProcessingResultSchema>;
export type ClipPayloadShape = z.infer<typeof ClipPayloadSchema>;
