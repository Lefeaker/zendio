import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { DEFAULT_OPTIONS } from '../../shared/config';
import { mergeOptions } from '../../shared/config/optionsMerger';
import { getVaultRouterConfig } from '../state/vaultRouterStore';
import { deepClone } from '../utils/clone';
import { type FormSectionRegistry } from './formSections/formSectionManager';

const KNOWN_KEYS = new Set([
  'rest',
  'templates',
  'domainMappings',
  'aiChat',
  'deepResearch',
  'video',
  'fragmentClipper',
  'readingSession',
  'classifier',
  'vaultRouter',
  'yamlConfig'
]);

const DEFAULT_AI_CHAT = DEFAULT_OPTIONS.aiChat ?? {
  includeTimestamps: false,
  userName: 'USER'
};
const DEFAULT_DEEP_RESEARCH = DEFAULT_OPTIONS.deepResearch ?? {
  pureMode: false
};
const DEFAULT_VIDEO = DEFAULT_OPTIONS.video ?? {
  floatingPromptEnabled: true,
  promptButtonLabel: 'Clip video',
  promptShortcut: ''
};
const DEFAULT_FRAGMENT_CLIPPER = DEFAULT_OPTIONS.fragmentClipper ?? {
  useFootnoteFormat: false,
  captureContext: true,
  contextLength: 100,
  contextMode: 'chars',
  selectionModifierEnabled: false,
  selectionModifierKeys: [],
  keyboardShortcutsEnabled: true
};
const DEFAULT_READING_SESSION = DEFAULT_OPTIONS.readingSession ?? {
  exportMode: 'highlights',
  highlightTheme: 'gradient'
};
const DEFAULT_CLASSIFIER = mergeOptions(null).classifier ?? DEFAULT_OPTIONS.classifier!;

function buildBaselineOptions(previous: StoredOptions | null): CompleteOptions {
  const merged = mergeOptions(previous);

  const baseline: CompleteOptions = {
    rest: deepClone(merged.rest),
    templates: deepClone(merged.templates),
    domainMappings: deepClone(merged.domainMappings),
    aiChat: deepClone(merged.aiChat ?? DEFAULT_AI_CHAT),
    deepResearch: deepClone(merged.deepResearch ?? DEFAULT_DEEP_RESEARCH),
    video: deepClone(merged.video ?? DEFAULT_VIDEO),
    fragmentClipper: deepClone(merged.fragmentClipper ?? DEFAULT_FRAGMENT_CLIPPER),
    readingSession: deepClone(merged.readingSession ?? DEFAULT_READING_SESSION),
    classifier: deepClone(merged.classifier ?? DEFAULT_CLASSIFIER)
  };

  const vaultRouterSnapshot = getVaultRouterConfig();
  if (vaultRouterSnapshot) {
    baseline.vaultRouter = vaultRouterSnapshot;
  } else if (previous?.vaultRouter !== undefined) {
    baseline.vaultRouter = previous.vaultRouter ?? null;
  }

  if (previous?.yamlConfig !== undefined) {
    (baseline as StoredOptions).yamlConfig = previous.yamlConfig ?? null;
  }

  if (previous) {
    for (const [key, value] of Object.entries(previous)) {
      if (!KNOWN_KEYS.has(key)) {
        (baseline as Record<string, unknown>)[key] = value;
      }
    }
  }

  return baseline;
}

export interface OptionsFormAdapter {
  read(previous: StoredOptions | null): CompleteOptions;
  apply(options: StoredOptions): Promise<void>;
}

export function createOptionsFormAdapter(registry: FormSectionRegistry): OptionsFormAdapter {
  return {
    read(previous: StoredOptions | null): CompleteOptions {
      const baseline = buildBaselineOptions(previous);
      const managed = registry.collect(previous);
      return { ...baseline, ...managed };
    },
    async apply(options: StoredOptions): Promise<void> {
      await registry.apply(options);
    }
  };
}
