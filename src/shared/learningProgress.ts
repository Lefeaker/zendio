import { z } from 'zod';

export const LEARNING_PROGRESS_KEY = 'learningProgress.v1';
export const LEARNING_COURSES = [
  'fragment',
  'article',
  'reader',
  'video',
  'chat',
  'vault'
] as const;
export type LearningCourse = (typeof LEARNING_COURSES)[number];
const courseSchema = z.enum(LEARNING_COURSES);
export const LearningReceiptSchema = z.object({
  operationId: z.string(),
  filePath: z.string(),
  destination: z.enum(['downloads', 'vault']),
  vaultName: z.string().optional(),
  downloadId: z.union([z.number(), z.string()]).optional(),
  savedAt: z.number()
});
export type LearningReceipt = z.infer<typeof LearningReceiptSchema>;
export const LearningProgressSchema = z.object({
  version: z.literal(1),
  completed: z.record(courseSchema, LearningReceiptSchema),
  latest: LearningReceiptSchema.optional(),
  pending: z.array(
    z.object({
      receipt: LearningReceiptSchema,
      courses: z.array(courseSchema),
      downloadIds: z.array(z.union([z.number(), z.string()])),
      failed: z.boolean().optional()
    })
  )
});
export type LearningProgress = z.infer<typeof LearningProgressSchema>;
export function emptyLearningProgress(): LearningProgress {
  return { version: 1, completed: {}, pending: [] };
}

export function readLearningProgress(value: unknown): LearningProgress {
  const parsed = LearningProgressSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyLearningProgress();
}

export function isLearningPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !['chromewebstore.google.com', 'addons.mozilla.org', 'microsoftedge.microsoft.com'].includes(
        url.hostname
      )
    );
  } catch {
    return false;
  }
}
