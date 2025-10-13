import { DEFAULT_CLASSIFIER_TAXONOMY, DEFAULT_DOMAIN_MAPPINGS } from './utils/defaults';
import { renderDomainMappings, collectDomainMappings } from './components/domainMappings';
import { parseClassifierTaxonomy } from './services/validation';
import { applyReadingTemplateControls, collectReadingTemplateValue } from './components/readingTemplateControls';
import type {
  AiChatOptions,
  ClassifierOptions,
  DeepResearchOptions,
  FragmentClipperOptions,
  ReadingSessionOptions,
  RestOptions,
  TemplateOptions,
  VideoOptions,
  StoredOptions
} from '../shared/types/options';

export type OptionSection =
  | 'rest'
  | 'templates'
  | 'domainMappings'
  | 'aiChat'
  | 'deepResearch'
  | 'video'
  | 'readingSession'
  | 'fragmentClipper'
  | 'classifier';

export type FieldControl = 'text' | 'password' | 'textarea' | 'checkbox' | 'select' | 'number';

export interface FieldEffect<TValue> {
  type: 'toggleDisplay';
  targetIds: string[];
  predicate: (value: TValue) => boolean;
}

export interface PrimitiveFieldSchema<TValue = unknown> {
  kind: 'primitive';
  section: OptionSection;
  optionKey: string;
  elementId: string;
  control: FieldControl;
  defaultValue: TValue | (() => TValue);
  apply: (element: HTMLElement, value: TValue | undefined, resolvedDefault: TValue) => void;
  extract: (element: HTMLElement, resolvedDefault: TValue) => TValue;
  effects?: FieldEffect<TValue>[];
  options?: Array<{ value: string; label?: string }>;
}

export interface CustomFieldSchema<TValue = unknown> {
  kind: 'custom';
  section: OptionSection;
  optionKey: string;
  defaultValue: TValue | (() => TValue);
  apply: (value: TValue | undefined, resolvedDefault: TValue) => void;
  collect: () => TValue;
}

export type OptionsFieldSchema = PrimitiveFieldSchema<unknown> | CustomFieldSchema<unknown>;

export interface SectionSchema {
  section: OptionSection;
  fields: OptionsFieldSchema[];
  finalize?: (draft: Record<string, unknown>, context: { previous?: unknown }) => Record<string, unknown>;
}

export interface SectionOptions {
  rest: RestOptions;
  templates: TemplateOptions;
  domainMappings: Record<string, string>;
  aiChat: AiChatOptions;
  deepResearch: DeepResearchOptions;
  video: VideoOptions;
  readingSession: ReadingSessionOptions;
  fragmentClipper: FragmentClipperOptions;
  classifier: ClassifierOptions;
}

export interface SectionStoredOptions {
  rest: StoredOptions['rest'];
  templates: StoredOptions['templates'];
  domainMappings: StoredOptions['domainMappings'];
  aiChat: StoredOptions['aiChat'];
  deepResearch: StoredOptions['deepResearch'];
  video: StoredOptions['video'];
  readingSession: StoredOptions['readingSession'];
  fragmentClipper: StoredOptions['fragmentClipper'];
  classifier: StoredOptions['classifier'];
}

const ARTICLE_TEMPLATE_DEFAULT = 'Articles/{domain}/{yyyy}/{slug}.md';
const FRAGMENT_TEMPLATE_DEFAULT = 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md';
const READING_TEMPLATE_DEFAULT = 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md';
const AI_TEMPLATE_DEFAULT = 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md';
const READER_HIGHLIGHT_THEMES: ReadonlyArray<ReadingSessionOptions['highlightTheme']> = [
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
];

export const OPTIONS_FORM_SCHEMA: SectionSchema[] = [
  {
    section: 'rest',
    fields: [
      createTextField('rest', 'httpsUrl', 'restHttpsUrl', 'https://127.0.0.1:27124/'),
      createTextField('rest', 'httpUrl', 'restHttpUrl', 'http://127.0.0.1:27123/'),
      createTextField('rest', 'vault', 'restVault', 'YourVault'),
      createTextField('rest', 'apiKey', 'restKey', '')
    ],
    finalize: (draft, context) => {
      const httpsUrl = coerceString(draft.httpsUrl);
      const httpUrl = coerceString(draft.httpUrl);
      const vault = coerceString(draft.vault) || 'YourVault';
      const apiKey = coerceString(draft.apiKey) || '';
      const baseUrl = httpsUrl || httpUrl || 'https://127.0.0.1:27124/';
      const previous = (context.previous ?? {}) as Partial<RestOptions> | undefined;
      return {
        baseUrl,
        httpsUrl: httpsUrl || undefined,
        httpUrl: httpUrl || undefined,
        vault,
        apiKey,
        rootDir: previous?.rootDir
      };
    }
  },
  {
    section: 'templates',
    fields: [
      createTextField('templates', 'article', 'tplArticle', ARTICLE_TEMPLATE_DEFAULT),
      createTextField('templates', 'fragment', 'tplFragment', FRAGMENT_TEMPLATE_DEFAULT),
      {
        kind: 'custom',
        section: 'templates',
        optionKey: 'reading',
        defaultValue: READING_TEMPLATE_DEFAULT,
        apply: (value, resolvedDefault) => {
          const templates = value as Partial<TemplateOptions> | undefined;
          applyReadingTemplateControls({
            template: templates?.reading,
            defaultTemplate: resolvedDefault as string,
            articleDefault: ARTICLE_TEMPLATE_DEFAULT,
            fragmentDefault: FRAGMENT_TEMPLATE_DEFAULT
          });
        },
        collect: () => {
          return collectReadingTemplateValue({
            defaultTemplate: READING_TEMPLATE_DEFAULT,
            articleDefault: ARTICLE_TEMPLATE_DEFAULT,
            fragmentDefault: FRAGMENT_TEMPLATE_DEFAULT
          });
        }
      },
      createTextField('templates', 'ai', 'tplAI', AI_TEMPLATE_DEFAULT)
    ],
    finalize: (draft, context) => {
      const previous = (context.previous ?? {}) as Partial<TemplateOptions> | undefined;
      return {
        article: coerceString(draft.article) || previous?.article || ARTICLE_TEMPLATE_DEFAULT,
        fragment: coerceString(draft.fragment) || previous?.fragment || FRAGMENT_TEMPLATE_DEFAULT,
        reading: coerceString(draft.reading) || previous?.reading || READING_TEMPLATE_DEFAULT,
        ai: coerceString(draft.ai) || previous?.ai || AI_TEMPLATE_DEFAULT
      };
    }
  },
  {
    section: 'domainMappings',
    fields: [
      {
        kind: 'custom',
        section: 'domainMappings',
        optionKey: 'domainMappings',
        defaultValue: () => DEFAULT_DOMAIN_MAPPINGS,
        apply: (value, resolvedDefault) => {
          const fallback = resolvedDefault as Record<string, string>;
          const mappings = value && Object.keys(value as Record<string, string>).length > 0
            ? (value as Record<string, string>)
            : fallback;
          renderDomainMappings({ ...mappings });
        },
        collect: () => collectDomainMappings()
      }
    ],
    finalize: (draft) => {
      const value = draft.domainMappings as Record<string, string> | undefined;
      return value && Object.keys(value).length > 0 ? value : { ...DEFAULT_DOMAIN_MAPPINGS };
    }
  },
  {
    section: 'aiChat',
    fields: [
      createCheckboxField('aiChat', 'includeTimestamps', 'aiIncludeTimestamps', false),
      createTextField('aiChat', 'userName', 'aiUserName', 'USER')
    ],
    finalize: (draft, context) => {
      const previous = (context.previous ?? {}) as Partial<AiChatOptions> | undefined;
      return {
        includeTimestamps: Boolean(draft.includeTimestamps ?? previous?.includeTimestamps ?? false),
        userName: coerceString(draft.userName) || previous?.userName || 'USER'
      };
    }
  },
  {
    section: 'deepResearch',
    fields: [createCheckboxField('deepResearch', 'pureMode', 'deepResearchPureMode', false)],
    finalize: (draft, context) => {
      const previous = (context.previous ?? {}) as Partial<DeepResearchOptions> | undefined;
      return {
        pureMode: Boolean(draft.pureMode ?? previous?.pureMode ?? false)
      };
    }
  },
  {
    section: 'video',
    fields: [createCheckboxField('video', 'floatingPromptEnabled', 'videoFloatingPrompt', true)],
    finalize: (draft, context) => {
      const previous = (context.previous ?? {}) as Partial<VideoOptions> | undefined;
      return {
        floatingPromptEnabled: Boolean(draft.floatingPromptEnabled ?? previous?.floatingPromptEnabled ?? true)
      };
    }
  },
  {
    section: 'readingSession',
    fields: [
      {
        kind: 'primitive',
        section: 'readingSession',
        optionKey: 'exportMode',
        elementId: 'readingExportMode',
        control: 'select',
        defaultValue: 'highlights',
        options: [
          { value: 'highlights' },
          { value: 'full' }
        ],
        apply: (element, value, resolvedDefault) => {
          const select = element as HTMLSelectElement;
          const fallback = resolvedDefault as ReadingSessionOptions['exportMode'];
          select.value = (value as string | undefined) ?? fallback;
        },
        extract: (element, resolvedDefault) => {
          const fallback = resolvedDefault as ReadingSessionOptions['exportMode'];
          const raw = (element as HTMLSelectElement).value || fallback;
          return raw as ReadingSessionOptions['exportMode'];
        }
      },
      {
        kind: 'custom',
        section: 'readingSession',
        optionKey: 'highlightTheme',
        defaultValue: 'gradient',
        apply: (value, resolvedDefault) => {
          const container = document.getElementById('readingHighlightTheme');
          if (!(container instanceof HTMLElement)) {
            return;
          }

          const fallback = resolvedDefault as ReadingSessionOptions['highlightTheme'];
          const incoming = typeof value === 'string' ? value : undefined;
          const initialTheme = incoming && READER_HIGHLIGHT_THEMES.includes(incoming as ReadingSessionOptions['highlightTheme'])
            ? (incoming as ReadingSessionOptions['highlightTheme'])
            : fallback;

          const updateSelection = (theme: ReadingSessionOptions['highlightTheme']): void => {
            const normalized = READER_HIGHLIGHT_THEMES.includes(theme) ? theme : fallback;
            container.dataset.selectedTheme = normalized;
            container
              .querySelectorAll<HTMLButtonElement>('[data-theme]')
              .forEach((button) => {
                const buttonTheme = button.dataset.theme as ReadingSessionOptions['highlightTheme'] | undefined;
                const isCurrent = buttonTheme === normalized;
                button.classList.toggle('is-selected', isCurrent);
                button.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
                button.tabIndex = isCurrent ? 0 : -1;
              });
          };

          updateSelection(initialTheme);

          if (!container.dataset.bound) {
            container.addEventListener('click', (event) => {
              const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-theme]');
              if (!target) {
                return;
              }
              const theme = target.dataset.theme as ReadingSessionOptions['highlightTheme'] | undefined;
              if (!theme || !READER_HIGHLIGHT_THEMES.includes(theme)) {
                return;
              }
              updateSelection(theme);
            });

            container.addEventListener('keydown', (event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                return;
              }
              event.preventDefault();
              const current = container.dataset.selectedTheme as ReadingSessionOptions['highlightTheme'] | undefined;
              const currentIndex = current ? READER_HIGHLIGHT_THEMES.indexOf(current) : -1;
              if (currentIndex === -1) {
                return;
              }
              const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
              const nextIndex = (currentIndex + (isPrevious ? -1 : 1) + READER_HIGHLIGHT_THEMES.length) % READER_HIGHLIGHT_THEMES.length;
              const nextTheme = READER_HIGHLIGHT_THEMES[nextIndex];
              updateSelection(nextTheme);
              container.querySelector<HTMLButtonElement>(`[data-theme="${nextTheme}"]`)?.focus();
            });

            container.dataset.bound = 'true';
          }
        },
        collect: () => {
          const container = document.getElementById('readingHighlightTheme');
          const selected = container?.dataset.selectedTheme as ReadingSessionOptions['highlightTheme'] | undefined;
          return selected && READER_HIGHLIGHT_THEMES.includes(selected) ? selected : 'gradient';
        }
      }
    ],
    finalize: (draft, context) => {
      const previous = (context.previous ?? {}) as Partial<ReadingSessionOptions> | undefined;
      const mode = draft.exportMode as ReadingSessionOptions['exportMode'] | undefined;
      const theme = draft.highlightTheme as ReadingSessionOptions['highlightTheme'] | undefined;
      const previousTheme = previous?.highlightTheme;
      const resolvedTheme = theme && READER_HIGHLIGHT_THEMES.includes(theme)
        ? theme
        : previousTheme && READER_HIGHLIGHT_THEMES.includes(previousTheme)
          ? previousTheme
          : 'gradient';
      return {
        exportMode: mode || previous?.exportMode || 'highlights',
        highlightTheme: resolvedTheme
      };
    }
  },
  {
    section: 'fragmentClipper',
    fields: [
      createCheckboxField('fragmentClipper', 'useFootnoteFormat', 'fragmentUseFootnote', true),
      createCheckboxField('fragmentClipper', 'captureContext', 'fragmentCaptureContext', false),
      {
        ...createCheckboxField('fragmentClipper', 'selectionModifierEnabled', 'fragmentModifierToggle', false),
        effects: [
          {
            type: 'toggleDisplay',
            targetIds: ['fragmentModifierKeysGroup'],
            predicate: (value: unknown) => Boolean(value)
          }
        ]
      },
      {
        kind: 'custom',
        section: 'fragmentClipper',
        optionKey: 'selectionModifierKeys',
        defaultValue: () => [],
        apply: (value, resolvedDefault) => {
          const section = value as Partial<FragmentClipperOptions> | undefined;
          const configured = Array.isArray(section?.selectionModifierKeys)
            ? section.selectionModifierKeys
            : (resolvedDefault as FragmentClipperOptions['selectionModifierKeys']);
          document
            .querySelectorAll<HTMLInputElement>('[data-fragment-modifier-key]')
            .forEach(input => {
              const key = input.dataset.fragmentModifierKey as FragmentClipperOptions['selectionModifierKeys'][number] | undefined;
              input.checked = key ? configured.includes(key) : false;
            });
        },
        collect: () => {
          const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-fragment-modifier-key]'));
          return inputs
            .filter(input => input.checked)
            .map(input => input.dataset.fragmentModifierKey)
            .filter((key): key is FragmentClipperOptions['selectionModifierKeys'][number] => {
              return key === 'alt' || key === 'meta' || key === 'ctrl' || key === 'shift';
            });
        }
      }
    ],
    finalize: (draft, context) => {
      const previous = (context.previous ?? {}) as Partial<FragmentClipperOptions> | undefined;
      const contextMode = typeof draft.contextMode === 'string'
        ? (draft.contextMode as FragmentClipperOptions['contextMode'])
        : previous?.contextMode ?? 'chars';
      const selectionModifierKeys = Array.isArray(draft.selectionModifierKeys)
        ? (draft.selectionModifierKeys as FragmentClipperOptions['selectionModifierKeys'])
        : previous?.selectionModifierKeys ?? [];
      return {
        useFootnoteFormat: Boolean(draft.useFootnoteFormat ?? previous?.useFootnoteFormat ?? true),
        captureContext: Boolean(draft.captureContext ?? previous?.captureContext ?? false),
        contextLength: typeof draft.contextLength === 'number' ? draft.contextLength : previous?.contextLength ?? 200,
        contextMode,
        selectionModifierEnabled: Boolean(draft.selectionModifierEnabled ?? previous?.selectionModifierEnabled ?? false),
        selectionModifierKeys: [...selectionModifierKeys]
      };
    }
  },
  /*
   * 分类器配置暂时隐藏，保留默认配置即可
  {
    section: 'classifier',
    fields: [
      {
        ...createCheckboxField('classifier', 'enabled', 'clsEnable', false),
        effects: [
          {
            type: 'toggleDisplay',
            targetIds: ['classifierConfig'],
            predicate: (value: unknown) => Boolean(value)
          }
        ]
      },
      {
        kind: 'primitive',
        section: 'classifier',
        optionKey: 'provider',
        elementId: 'clsProvider',
        control: 'select',
        defaultValue: 'ollama',
        options: [
          { value: 'ollama', label: 'Ollama' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'compatible', label: 'Compatible' }
        ],
        apply: (element, value, resolvedDefault) => {
          const select = element as HTMLSelectElement;
          const fallback = resolvedDefault as ClassifierOptions['provider'];
          select.value = (value as string | undefined) ?? fallback;
        },
        extract: (element, resolvedDefault) => {
          const select = element as HTMLSelectElement;
          return (select.value || resolvedDefault) as ClassifierOptions['provider'];
        }
      },
      createTextField('classifier', 'endpoint', 'clsEndpoint', 'http://localhost:11434/api/chat'),
      createTextField('classifier', 'model', 'clsModel', 'llama3.1'),
      createTextField('classifier', 'apiKey', 'clsKey', ''),
      {
        kind: 'primitive',
        section: 'classifier',
        optionKey: 'taxonomy',
        elementId: 'clsTax',
        control: 'textarea',
        defaultValue: () => JSON.stringify(DEFAULT_CLASSIFIER_TAXONOMY, null, 2),
        apply: (element, value, resolvedDefault) => {
          const textarea = element as HTMLTextAreaElement;
          if (typeof value === 'string') {
            textarea.value = value;
            return;
          }
          try {
            const fallback = parseJSONSafe(String(resolvedDefault ?? JSON.stringify(DEFAULT_CLASSIFIER_TAXONOMY))) as unknown;
            textarea.value = JSON.stringify(value ?? fallback, null, 2);
          } catch {
            textarea.value = String(resolvedDefault ?? JSON.stringify(DEFAULT_CLASSIFIER_TAXONOMY, null, 2));
          }
        },
        extract: (element) => {
          const raw = (element as HTMLTextAreaElement).value || '';
          return parseClassifierTaxonomy(raw);
        }
      }
    ],
    finalize: (draft, context) => {
      const previous = (context.previous ?? {}) as Partial<ClassifierOptions> | undefined;
      const taxonomyRaw = draft.taxonomy ?? previous?.taxonomy ?? DEFAULT_CLASSIFIER_TAXONOMY;
      const parsedTaxonomy = typeof taxonomyRaw === 'string' ? parseJSONSafe(taxonomyRaw) : taxonomyRaw;
      return {
        enabled: Boolean(draft.enabled ?? previous?.enabled ?? false),
        provider: (draft.provider as ClassifierOptions['provider']) || previous?.provider || 'ollama',
        endpoint: coerceString(draft.endpoint) || previous?.endpoint || 'http://localhost:11434/api/chat',
        model: coerceString(draft.model) || previous?.model || 'llama3.1',
        apiKey: coerceString(draft.apiKey) || previous?.apiKey || '',
        taxonomy: parsedTaxonomy ?? {}
      };
    }
  }
  */
];

export function isPrimitiveFieldSchema(field: OptionsFieldSchema): field is PrimitiveFieldSchema<unknown> {
  return field.kind === 'primitive';
}

export function isCustomFieldSchema(field: OptionsFieldSchema): field is CustomFieldSchema<unknown> {
  return field.kind === 'custom';
}

export function resolveDefaultValue<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

function createTextField(
  section: OptionSection,
  optionKey: string,
  elementId: string,
  defaultValue: string
): PrimitiveFieldSchema<string> {
  return {
    kind: 'primitive',
    section,
    optionKey,
    elementId,
    control: 'text',
    defaultValue,
    apply: (element, value, resolvedDefault) => {
      (element as HTMLInputElement).value = (value ?? resolvedDefault).toString();
    },
    extract: (element, resolvedDefault) => {
      const raw = (element as HTMLInputElement).value;
      const trimmed = raw.trim();
      return trimmed || resolvedDefault;
    }
  };
}

function createCheckboxField(
  section: OptionSection,
  optionKey: string,
  elementId: string,
  defaultValue: boolean
): PrimitiveFieldSchema<boolean> {
  return {
    kind: 'primitive',
    section,
    optionKey,
    elementId,
    control: 'checkbox',
    defaultValue,
    apply: (element, value, resolvedDefault) => {
      (element as HTMLInputElement).checked = value ?? resolvedDefault;
    },
    extract: (element) => {
      return (element as HTMLInputElement).checked;
    }
  };
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseJSONSafe(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
