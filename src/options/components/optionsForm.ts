import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { DEFAULT_OPTIONS } from '../../shared/config';
import { getVaultRouterConfig } from '../state/vaultRouterStore';
import { getElementById } from '../utils/dom';
import {
  OPTIONS_FORM_SCHEMA,
  resolveDefaultValue,
  SectionOptions,
  SectionStoredOptions,
  OptionsFieldSchema,
  FieldEffect,
  isPrimitiveFieldSchema,
  isCustomFieldSchema
} from '../schema';

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'rest',
  'templates',
  'domainMappings',
  'aiChat',
  'deepResearch',
  'fragmentClipper',
  'readingSession',
  'classifier',
  'vaultRouter'
]);

export function renderOptionsForm(options: StoredOptions = {}): void {
  OPTIONS_FORM_SCHEMA.forEach(sectionSchema => {
    const sectionKey = sectionSchema.section;
    const storedSection = options[sectionKey as keyof StoredOptions] as SectionStoredOptions[typeof sectionKey] | undefined;

    sectionSchema.fields.forEach(field => {
      if (isPrimitiveFieldSchema(field)) {
        const element = getElementById<HTMLElement>(field.elementId);
        const resolvedDefault = resolveDefaultValue(field.defaultValue);
        const storedValue = storedSection ? (storedSection as Record<string, unknown>)[field.optionKey] : undefined;
        field.apply(element, storedValue as unknown, resolvedDefault);

        if (field.effects?.length) {
          const current = field.extract(element, resolvedDefault);
          applyFieldEffects(field.effects, current);
        }
      } else if (isCustomFieldSchema(field)) {
        const resolvedDefault = resolveDefaultValue(field.defaultValue);
        field.apply(storedSection as unknown, resolvedDefault as unknown);
      }
    });
  });
}

export function collectOptionsFromForm(previous: StoredOptions | null): CompleteOptions {
  const sectionResults: Partial<SectionOptions> = {};

  OPTIONS_FORM_SCHEMA.forEach(sectionSchema => {
    const sectionKey = sectionSchema.section;
    const draft: Record<string, unknown> = {};

    sectionSchema.fields.forEach(field => {
      if (isPrimitiveFieldSchema(field)) {
        const element = getElementById<HTMLElement>(field.elementId);
        const resolvedDefault = resolveDefaultValue(field.defaultValue);
        draft[field.optionKey] = field.extract(element, resolvedDefault);
      } else if (isCustomFieldSchema(field)) {
        draft[field.optionKey] = field.collect();
      }
    });

    const previousSection = previous?.[sectionKey as keyof StoredOptions] as SectionStoredOptions[typeof sectionKey] | undefined;
    const completed = sectionSchema.finalize
      ? sectionSchema.finalize(draft as Partial<SectionOptions[typeof sectionKey]>, { previous: previousSection })
      : (draft as SectionOptions[typeof sectionKey]);

    (sectionResults as Record<string, unknown>)[sectionKey] = completed;
  });

  const rest = sectionResults.rest ?? DEFAULT_OPTIONS.rest;
  const templates = sectionResults.templates ?? DEFAULT_OPTIONS.templates;
  const domainMappings = sectionResults.domainMappings ? { ...sectionResults.domainMappings } : { ...DEFAULT_OPTIONS.domainMappings };
  const aiChat = sectionResults.aiChat ?? DEFAULT_OPTIONS.aiChat;
  const deepResearch = sectionResults.deepResearch ?? DEFAULT_OPTIONS.deepResearch;
  const fragmentClipper = sectionResults.fragmentClipper ?? DEFAULT_OPTIONS.fragmentClipper;
  const readingSession = sectionResults.readingSession ?? DEFAULT_OPTIONS.readingSession;
  const classifier = sectionResults.classifier ?? DEFAULT_OPTIONS.classifier;

  const options: CompleteOptions = {
    rest,
    templates,
    domainMappings,
    aiChat,
    deepResearch,
    fragmentClipper,
    readingSession,
    classifier
  };

  const vaultRouter = getVaultRouterConfig();
  if (vaultRouter) {
    options.vaultRouter = vaultRouter;
  }

  if (previous) {
    for (const [key, value] of Object.entries(previous)) {
      if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
        (options as Record<string, unknown>)[key] = value;
      }
    }
  }

  return options;
}

export function bindOptionsFormEvents(): void {
  OPTIONS_FORM_SCHEMA.forEach(sectionSchema => {
    sectionSchema.fields.forEach(field => {
      if (!isPrimitiveFieldSchema(field) || !field.effects?.length) {
        return;
      }

      const element = getElementById<HTMLElement>(field.elementId);
      const eventName = field.control === 'text' || field.control === 'password' || field.control === 'textarea' || field.control === 'number'
        ? 'input'
        : 'change';

      element.addEventListener(eventName, () => {
        const resolvedDefault = resolveDefaultValue(field.defaultValue);
        const current = field.extract(element, resolvedDefault);
        applyFieldEffects(field.effects!, current);
      });
    });
  });
}

function applyFieldEffects<TValue>(effects: FieldEffect<TValue>[], value: TValue): void {
  effects.forEach(effect => {
    if (effect.type === 'toggleDisplay') {
      const shouldShow = effect.predicate(value);
      effect.targetIds.forEach(targetId => {
        const target = getElementById<HTMLElement>(targetId);
        target.style.display = shouldShow ? 'block' : 'none';
      });
    }
  });
}
