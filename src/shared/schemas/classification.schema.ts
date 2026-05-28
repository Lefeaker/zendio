import { z } from 'zod';
import { AppErrorSchema } from './error.schema';

/**
 * ClassificationResult Schema
 * 替换 src/background/services/classificationService.ts 中的 ClassificationResult
 */
export const ClassificationResultSchema = z
  .object({
    type: z.string().optional(),
    topics: z.array(z.string()).optional(),
    ai_platform: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['success', 'fallback']),
    fallbackReason: z.enum(['disabled', 'error', 'timeout']).optional(),
    errorDetail: AppErrorSchema.optional()
  })
  .strip();

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

/**
 * Optional request schema used when validating classification inputs at boundaries.
 * Mirrors current classifier meta + preview usage without strict URL enforcement.
 */
export const ClassificationRequestSchema = z
  .object({
    typeHint: z.string().min(1),
    platform: z.string().min(1),
    url: z.string().optional(),
    title: z.string().min(1),
    preview: z.string().min(1)
  })
  .strip();

export type ClassificationRequest = z.infer<typeof ClassificationRequestSchema>;
