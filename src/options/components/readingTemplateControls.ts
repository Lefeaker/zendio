const READING_MODE_SELECT_ID = 'tplReadingMode';
const READING_CUSTOM_INPUT_ID = 'tplReadingCustom';
const ARTICLE_TEMPLATE_INPUT_ID = 'tplArticle';
const FRAGMENT_TEMPLATE_INPUT_ID = 'tplFragment';

export type ReadingTemplateMode = 'article' | 'fragment' | 'custom';

interface ApplyParams {
  template?: string;
  defaultTemplate: string;
  articleDefault: string;
  fragmentDefault: string;
}

interface CollectParams {
  defaultTemplate: string;
  articleDefault: string;
  fragmentDefault: string;
}

function resolveTemplate(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function getElements(): {
  select: HTMLSelectElement | null;
  input: HTMLInputElement | null;
  article: HTMLInputElement | null;
  fragment: HTMLInputElement | null;
} {
  const select = document.getElementById(READING_MODE_SELECT_ID) as HTMLSelectElement | null;
  const input = document.getElementById(READING_CUSTOM_INPUT_ID) as HTMLInputElement | null;
  const article = document.getElementById(ARTICLE_TEMPLATE_INPUT_ID) as HTMLInputElement | null;
  const fragment = document.getElementById(FRAGMENT_TEMPLATE_INPUT_ID) as HTMLInputElement | null;
  return { select, input, article, fragment };
}

function setState(
  select: HTMLSelectElement,
  input: HTMLInputElement,
  mode: ReadingTemplateMode,
  template: string
): void {
  if (select.value !== mode) {
    select.value = mode;
  }
  input.disabled = mode !== 'custom';
  if (input.value !== template) {
    input.value = template;
  }
  if (mode === 'custom') {
    input.dataset.customTemplate = template;
  }
}

export function applyReadingTemplateControls(params: ApplyParams): void {
  const { select, input, article, fragment } = getElements();
  if (!select || !input) {
    return;
  }

  const articleTemplate = resolveTemplate(article?.value, params.articleDefault);
  const fragmentTemplate = resolveTemplate(fragment?.value, params.fragmentDefault);
  const activeTemplate = resolveTemplate(params.template, params.defaultTemplate);

  let mode: ReadingTemplateMode = 'custom';
  if (activeTemplate === articleTemplate) {
    mode = 'article';
  } else if (activeTemplate === fragmentTemplate) {
    mode = 'fragment';
  }

  setState(select, input, mode, activeTemplate);
  if (!input.dataset.customTemplate) {
    if (mode === 'custom') {
      input.dataset.customTemplate = activeTemplate;
    } else {
      input.dataset.customTemplate = params.defaultTemplate;
    }
  }

  if (!select.dataset.readingBound) {
    select.addEventListener('change', () => {
      const latestArticle = resolveTemplate(article?.value, params.articleDefault);
      const latestFragment = resolveTemplate(fragment?.value, params.fragmentDefault);
      const currentMode = select.value as ReadingTemplateMode;
      if (currentMode === 'article') {
        setState(select, input, 'article', latestArticle);
      } else if (currentMode === 'fragment') {
        setState(select, input, 'fragment', latestFragment);
      } else {
        const stored = resolveTemplate(input.dataset.customTemplate, params.defaultTemplate);
        setState(select, input, 'custom', stored);
        input.focus();
        input.select();
      }
    });
    select.dataset.readingBound = 'true';
  }

  if (!input.dataset.readingBound) {
    input.addEventListener('input', () => {
      if (!input.disabled) {
        input.dataset.customTemplate = input.value;
      }
    });
    input.dataset.readingBound = 'true';
  }

  const bindSourceUpdate = (source: HTMLInputElement | null, modeName: ReadingTemplateMode, fallback: string): void => {
    if (!source || source.dataset.readingWatcher) {
      return;
    }
    source.addEventListener('input', () => {
      if (select.value === modeName) {
        const latest = resolveTemplate(source.value, fallback);
        setState(select, input, modeName, latest);
      }
    });
    source.dataset.readingWatcher = 'true';
  };

  bindSourceUpdate(article, 'article', params.articleDefault);
  bindSourceUpdate(fragment, 'fragment', params.fragmentDefault);
}

export function collectReadingTemplateValue(params: CollectParams): string {
  const { select, input, article, fragment } = getElements();
  const mode = (select?.value as ReadingTemplateMode | undefined) ?? 'custom';

  const articleTemplate = resolveTemplate(article?.value, params.articleDefault);
  const fragmentTemplate = resolveTemplate(fragment?.value, params.fragmentDefault);
  const customTemplate = resolveTemplate(input?.value, params.defaultTemplate);

  if (mode === 'article') {
    return articleTemplate;
  }
  if (mode === 'fragment') {
    return fragmentTemplate;
  }
  return customTemplate;
}
