export type ReadingTemplateMode = 'article' | 'fragment' | 'custom';

export interface ReadingTemplateDefaults {
  defaultTemplate: string;
  articleDefault: string;
  fragmentDefault: string;
}

export interface ReadingTemplateControllerDeps {
  modeSelect: HTMLSelectElement;
  customInput: HTMLInputElement;
  articleInput: HTMLInputElement;
  fragmentInput: HTMLInputElement;
  onChange?: () => void;
}

export interface ReadingTemplateController {
  apply(template: string | undefined): void;
  collect(): string;
  dispose(): void;
}

interface EventBinding {
  target: EventTarget;
  type: string;
  handler: EventListenerOrEventListenerObject;
}

const resolveTemplate = (value: string | undefined | null, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

const clampMode = (mode: string | null | undefined): ReadingTemplateMode => {
  if (mode === 'article' || mode === 'fragment' || mode === 'custom') {
    return mode;
  }
  return 'custom';
};

export function createReadingTemplateController(
  deps: ReadingTemplateControllerDeps,
  defaults: ReadingTemplateDefaults
): ReadingTemplateController {
  const { modeSelect, customInput, articleInput, fragmentInput, onChange } = deps;
  const bindings: EventBinding[] = [];
  const notifyChange = (): void => {
    onChange?.();
  };

  const applyState = (mode: ReadingTemplateMode, template: string): void => {
    if (modeSelect.value !== mode) {
      modeSelect.value = mode;
    }
    const shouldEnableCustom = mode === 'custom';
    customInput.disabled = !shouldEnableCustom;
    if (customInput.value !== template) {
      customInput.value = template;
    }
    if (shouldEnableCustom) {
      customInput.dataset.customTemplate = template;
    }
  };

  const getResolvedArticle = (): string =>
    resolveTemplate(articleInput.value, defaults.articleDefault);

  const getResolvedFragment = (): string =>
    resolveTemplate(fragmentInput.value, defaults.fragmentDefault);

  const getCustomTemplate = (): string => {
    return resolveTemplate(customInput.value, defaults.defaultTemplate);
  };

  const syncFromMode = (mode: ReadingTemplateMode): void => {
    if (mode === 'article') {
      applyState('article', getResolvedArticle());
    } else if (mode === 'fragment') {
      applyState('fragment', getResolvedFragment());
    } else {
      const stored = resolveTemplate(customInput.dataset.customTemplate, defaults.defaultTemplate);
      applyState('custom', stored);
      customInput.focus();
      customInput.select();
    }
  };

  const onModeChange = (): void => {
    const nextMode = clampMode(modeSelect.value);
    syncFromMode(nextMode);
    notifyChange();
  };

  const onCustomInput = (): void => {
    if (!customInput.disabled) {
      customInput.dataset.customTemplate = customInput.value;
      notifyChange();
    }
  };

  const onArticleInput = (): void => {
    if (modeSelect.value === 'article') {
      applyState('article', getResolvedArticle());
    }
    notifyChange();
  };

  const onFragmentInput = (): void => {
    if (modeSelect.value === 'fragment') {
      applyState('fragment', getResolvedFragment());
    }
    notifyChange();
  };

  const bind = (
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject
  ): void => {
    target.addEventListener(type, handler);
    bindings.push({ target, type, handler });
  };

  bind(modeSelect, 'change', onModeChange);
  bind(customInput, 'input', onCustomInput);
  bind(articleInput, 'input', onArticleInput);
  bind(fragmentInput, 'input', onFragmentInput);

  return {
    apply(template) {
      const resolvedArticle = getResolvedArticle();
      const resolvedFragment = getResolvedFragment();
      const activeTemplate = resolveTemplate(template, defaults.defaultTemplate);

      let mode: ReadingTemplateMode = 'custom';
      if (activeTemplate === resolvedArticle) {
        mode = 'article';
      } else if (activeTemplate === resolvedFragment) {
        mode = 'fragment';
      }

      applyState(mode, activeTemplate);
      if (!customInput.dataset.customTemplate) {
        customInput.dataset.customTemplate =
          mode === 'custom' ? activeTemplate : defaults.defaultTemplate;
      }
    },
    collect() {
      const mode = clampMode(modeSelect.value);
      if (mode === 'article') {
        return getResolvedArticle();
      }
      if (mode === 'fragment') {
        return getResolvedFragment();
      }
      return getCustomTemplate();
    },
    dispose() {
      bindings.forEach(({ target, type, handler }) => {
        target.removeEventListener(type, handler);
      });
      bindings.length = 0;
      delete customInput.dataset.customTemplate;
    }
  };
}
