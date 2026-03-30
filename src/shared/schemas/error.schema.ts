import { z } from 'zod';
import { ErrorSeverity } from '../errors/types';

export const ErrorSeveritySchema = z.nativeEnum(ErrorSeverity);

export const AppErrorSchema = z.object({
  code: z.string(),
  domain: z.enum([
    'i18n',
    'extraction',
    'classifier',
    'rest',
    'chrome-api',
    'notifications',
    'options',
    'background',
    'content',
    'unknown'
  ]),
  message: z.string(),
  severity: ErrorSeveritySchema,
  recoverable: z.boolean(),
  userMessage: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  cause: z.unknown().optional(),
  timestamp: z.number().optional()
});

export type AppErrorShape = z.infer<typeof AppErrorSchema>;
