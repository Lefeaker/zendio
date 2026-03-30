import { getTextBudget, TEXT_BUDGETS, type TextBudget } from '../src/shared/i18n/budgets';
import { LANGUAGE_CONFIG, resolveLanguage, type LangCode } from '../src/i18n/config';

export type LayoutIssueType = 'overflow-x' | 'overflow-y' | 'truncated';

export interface LayoutIssue {
  selector: string;
  language: string;
  issue: LayoutIssueType;
  key?: string;
  component?: string;
  priority: TextBudget['priority'];
  details?: string;
  languageMeta?: {
    code: LangCode;
    englishName: string;
    nativeName: string;
    region: string;
    textExpansion: number;
    dir: 'ltr' | 'rtl';
  };
}

interface InspectOptions {
  selectors?: string[];
}

function buildSelector(element: Element): string {
  if (!(element instanceof HTMLElement)) {
    return element.tagName.toLowerCase();
  }

  const parts: string[] = [];
  let node: HTMLElement | null = element;

  while (node && parts.length < 4) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      part += `#${node.id}`;
      parts.unshift(part);
      break;
    }
    if (node.className) {
      const className = node.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (className) {
        part += `.${className}`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
  }

  return parts.join(' > ');
}

function hasTextOverflow(element: HTMLElement): LayoutIssueType | null {
  const style = window.getComputedStyle(element);
  const scrollWidth = element.scrollWidth;
  const clientWidth = element.clientWidth;
  const scrollHeight = element.scrollHeight;
  const clientHeight = element.clientHeight;

  const overflowX = scrollWidth - clientWidth > 1;
  const overflowY = scrollHeight - clientHeight > 1;

  if (overflowX && style.overflowX === 'hidden') {
    return 'truncated';
  }
  if (overflowX) {
    return 'overflow-x';
  }
  if (overflowY && style.whiteSpace === 'nowrap') {
    return 'truncated';
  }
  if (overflowY) {
    return 'overflow-y';
  }
  return null;
}

function normaliseIssuePriority(key?: string, language?: string): TextBudget['priority'] {
  const budget = key ? getTextBudget(key, language) : undefined;
  return budget?.priority ?? 'low';
}

function guessComponent(key?: string, language?: string): string | undefined {
  if (!key) {
    return undefined;
  }
  const budget = getTextBudget(key, language);
  return budget?.component;
}

export class LayoutInspector {
  private readonly selectors: string[];

  constructor(private readonly root: Document = document, options: InspectOptions = {}) {
    this.selectors = options.selectors ?? [
      '[data-i18n]',
      '[data-i18n-html]',
      '[data-i18n-placeholder]',
      '[data-i18n-title]',
      '[data-i18n-aria-label]'
    ];
  }

  inspect(language: string): LayoutIssue[] {
    const nodes = this.root.querySelectorAll<HTMLElement>(this.selectors.join(','));
    const issues: LayoutIssue[] = [];
    const resolvedLanguage = resolveLanguage(language);
    const languageMeta = LANGUAGE_CONFIG[resolvedLanguage];

    nodes.forEach((element) => {
      const issueType = hasTextOverflow(element);
      if (!issueType) {
        return;
      }

      const key = element.getAttribute('data-i18n') ??
        element.getAttribute('data-i18n-html') ??
        element.getAttribute('data-i18n-placeholder') ??
        element.getAttribute('data-i18n-title') ??
        element.getAttribute('data-i18n-aria-label') ??
        undefined;

      issues.push({
        selector: buildSelector(element),
        language,
        issue: issueType,
        key,
        component: element.dataset.component ?? guessComponent(key, language),
        priority: element.dataset.priority as TextBudget['priority'] ?? normaliseIssuePriority(key, language),
        details: element.textContent?.trim().slice(0, 120),
        languageMeta: languageMeta
          ? {
              code: resolvedLanguage,
              englishName: languageMeta.englishName,
              nativeName: languageMeta.nativeName,
              region: languageMeta.region,
              textExpansion: languageMeta.textExpansion ?? 1,
              dir: languageMeta.dir
            }
          : undefined
      });
    });

    return issues;
  }

  async inspectWithLanguageSwitcher(
    languages: string[],
    setLanguage: (lang: string) => Promise<void>
  ): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];
    for (const lang of languages) {
      await setLanguage(lang);
      issues.push(...this.inspect(lang));
    }
    return issues;
  }
}

export function listBudgetedKeys(): string[] {
  return Object.keys(TEXT_BUDGETS);
}
