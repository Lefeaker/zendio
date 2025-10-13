import { mergeOptions } from '../../shared/config';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { deepClone } from './clone';

const PRESERVED_KEYS = new Set([
  'rest',
  'templates',
  'domainMappings',
  'aiChat',
  'deepResearch',
  'fragmentClipper',
  'readingSession',
  'video',
  'classifier',
  'vaultRouter'
]);

export function normalizeOptionsForTransfer(
  options: StoredOptions | CompleteOptions | null | undefined
): StoredOptions {
  const base = deepClone(options ?? {}) as StoredOptions;
  const merged = mergeOptions(base);

  const normalized: StoredOptions = {
    rest: deepClone(merged.rest),
    templates: deepClone(merged.templates),
    domainMappings: deepClone(merged.domainMappings)
  };

  normalized.aiChat = merged.aiChat ? deepClone(merged.aiChat) : undefined;
  normalized.deepResearch = merged.deepResearch ? deepClone(merged.deepResearch) : undefined;
  normalized.fragmentClipper = merged.fragmentClipper ? deepClone(merged.fragmentClipper) : undefined;
  normalized.readingSession = merged.readingSession ? deepClone(merged.readingSession) : undefined;
  normalized.video = merged.video ? deepClone(merged.video) : undefined;
  normalized.classifier = merged.classifier ? deepClone(merged.classifier) : undefined;
  normalized.vaultRouter = merged.vaultRouter ? deepClone(merged.vaultRouter) : undefined;

  Object.entries(base).forEach(([key, value]) => {
    if (PRESERVED_KEYS.has(key)) {
      return;
    }
    (normalized as Record<string, unknown>)[key] = deepClone(value);
  });

  return normalized;
}
