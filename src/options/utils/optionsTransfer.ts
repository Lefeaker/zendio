import { mergeOptions } from '../../shared/config';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { deepClone } from './clone';
import { normalizeYamlConfigOverrides } from '../../shared/services/yamlConfigService';

const PRESERVED_KEYS = new Set([
  'rest',
  'templates',
  'domainMappings',
  'aiChat',
  'fragmentClipper',
  'readingSession',
  'video',
  'vaultRouter'
]);

export function normalizeOptionsForTransfer(
  options: StoredOptions | CompleteOptions | null | undefined
): StoredOptions {
  const base = deepClone(options ?? {});
  const merged = mergeOptions(base);

  const normalized: StoredOptions = {
    rest: deepClone(merged.rest),
    templates: deepClone(merged.templates),
    domainMappings: deepClone(merged.domainMappings)
  };

  // Fix exactOptionalPropertyTypes error by conditionally assigning optional properties
  if (merged.aiChat) {
    normalized.aiChat = deepClone(merged.aiChat);
  }
  if (merged.fragmentClipper) {
    normalized.fragmentClipper = deepClone(merged.fragmentClipper);
  }
  if (merged.readingSession) {
    normalized.readingSession = deepClone(merged.readingSession);
  }
  if (merged.video) {
    normalized.video = deepClone(merged.video);
    const originalShortcut = (base as StoredOptions | CompleteOptions)?.video?.promptShortcut;
    if (originalShortcut && normalized.video?.promptShortcut) {
      normalized.video.promptShortcut = normalized.video.promptShortcut.toUpperCase();
    }
  }
  if (merged.vaultRouter) {
    normalized.vaultRouter = deepClone(merged.vaultRouter);
  }

  Object.entries(base).forEach(([key, value]) => {
    if (key === 'yamlConfig') {
      const sanitized = normalizeYamlConfigOverrides((value ?? null) as StoredOptions['yamlConfig']);
      if (sanitized) {
        normalized.yamlConfig = deepClone(sanitized);
      } else {
        normalized.yamlConfig = null;
      }
      return;
    }
    if (PRESERVED_KEYS.has(key)) {
      return;
    }
    (normalized as Record<string, unknown>)[key] = deepClone(value);
  });

  return normalized;
}
