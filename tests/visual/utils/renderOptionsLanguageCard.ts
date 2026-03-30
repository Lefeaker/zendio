import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Language, Messages } from '../../../src/i18n/locales';
import { messages as localeMessages, DEFAULT_LANGUAGE } from '../../../src/i18n/locales';
import { LANGUAGE_CONFIG, getLanguageFallbackChain } from '../../../src/i18n/config';
import { createI18nResource } from '../../../src/i18n/resource';
import { resolveAdaptiveText } from '@shared/i18n/textAdaptation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.env.AIINOB_PROJECT_ROOT
  ? path.resolve(process.env.AIINOB_PROJECT_ROOT)
  : path.resolve(__dirname, '../../..');
const CSS_CACHE: Record<string, string> = {};

function readCss(relativePath: string): string {
  if (!CSS_CACHE[relativePath]) {
    const absolutePath = path.join(ROOT_DIR, relativePath);
    CSS_CACHE[relativePath] = fs.readFileSync(absolutePath, 'utf-8');
  }
  return CSS_CACHE[relativePath];
}

const BASE_CSS = [
  'src/styles/design-tokens.css',
  'src/styles/components.css',
  'tests/visual/templates/options-shell.css'
]
  .map(readCss)
  .join('\n');

const MOCK_USAGE_VALUES: Record<string, string> = {
  usageTotalLabel: '1 280',
  usageAiLabel: '512',
  usageFragmentLabel: '456',
  usageArticleLabel: '312'
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createResource(language: Language) {
  const chain = getLanguageFallbackChain(language);
  const resolved = chain.find((code) => Boolean(localeMessages[code])) ?? DEFAULT_LANGUAGE;
  const fallbackChain = chain
    .filter((code) => code !== resolved)
    .map((code) => localeMessages[code])
    .filter((value): value is Messages => Boolean(value));

  const defaultMessages = localeMessages[DEFAULT_LANGUAGE];
  if (!fallbackChain.includes(defaultMessages)) {
    fallbackChain.push(defaultMessages);
  }

  return createI18nResource({
    language: resolved,
    messages: localeMessages[resolved],
    fallbackChain
  });
}

function renderUsageMetrics(resource: ReturnType<typeof createResource>): string {
  const metricKeys: Array<keyof Messages> = [
    'usageTotalLabel',
    'usageAiLabel',
    'usageFragmentLabel',
    'usageArticleLabel'
  ];

  return metricKeys
    .map((key) => {
      const label = resource.get(key);
      const value = MOCK_USAGE_VALUES[String(key)] ?? '0';
      return `
        <div class="metric">
          <span class="metric__label">${escapeHtml(String(label))}</span>
          <strong class="metric__value">${escapeHtml(value)}</strong>
        </div>
      `;
    })
    .join('\n');
}

interface AdaptiveButtonOptions {
  key: keyof Messages;
  resource: ReturnType<typeof createResource>;
  viewportWidth: number;
  classNames: string[];
}

function renderAdaptiveButton(options: AdaptiveButtonOptions): string {
  const { key, resource, viewportWidth, classNames } = options;
  const adaptation = resolveAdaptiveText(key, resource, { viewportWidth });
  const classes = ['btn-adaptive', ...classNames];
  const attributes: string[] = [`data-budget-key="${String(key)}"`];

  if (adaptation.usedShort) {
    attributes.push('data-adapted="short"');
    if (adaptation.original) {
      attributes.push(`data-original-text="${escapeHtml(adaptation.original)}"`);
      attributes.push(`title="${escapeHtml(adaptation.original)}"`);
    }
  } else if (adaptation.overLimit) {
    attributes.push('data-adapted="overflow"');
  } else if (adaptation.budget) {
    attributes.push('data-adapted="full"');
  }

  const content = escapeHtml(adaptation.value);
  return `<button class="${classes.join(' ')}" ${attributes.join(' ')}>${content}</button>`;
}

function renderLanguageOptions(language: Language): string {
  return Object.entries(LANGUAGE_CONFIG)
    .map(([code, meta]) => {
      const selected = code === language ? ' selected' : '';
      return `<option value="${code}"${selected}>${escapeHtml(meta.label)}</option>`;
    })
    .join('\n');
}

export function renderOptionsLanguageCanvas(language: Language, viewportWidth: number): string {
  const resource = createResource(language);
  const extensionName = resource.get('extensionName');
  const extensionSubtitle = resource.get('extensionSubtitle');
  const languageSettings = resource.get('languageSettings');
  const languageHint = resource.get('languageHint');
  const languageLabel = resource.get('languageLabel');
  const featureNote = resource.get('featureUntestedNote');

  const saveButton = renderAdaptiveButton({
    key: 'saveButton',
    classNames: ['btn-primary'],
    resource,
    viewportWidth
  });

  const testConnectionButton = renderAdaptiveButton({
    key: 'testConnectionButton',
    classNames: ['btn-ghost'],
    resource,
    viewportWidth
  });

  const diagnoseButton = renderAdaptiveButton({
    key: 'diagnoseButton',
    classNames: ['btn-ghost'],
    resource,
    viewportWidth
  });

  const usageMetrics = renderUsageMetrics(resource);
  const languageOptions = renderLanguageOptions(language);

  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Visual Regression – ${escapeHtml(String(extensionName))}</title>
    <style>
${BASE_CSS}
    </style>
  </head>
  <body data-theme="dark">
    <div class="visual-wrapper">
      <header class="page-header">
        <div class="page-header-main">
          <div class="page-header-logo" aria-hidden="true">AI</div>
          <div class="page-header-content">
            <div class="page-header-title-row">
              <h1>${escapeHtml(String(extensionName))}</h1>
              <span class="version-chip">v0.2.0</span>
            </div>
            <p class="subtitle">${escapeHtml(String(extensionSubtitle))}</p>
          </div>
        </div>
        <div class="page-header-actions">
          ${saveButton}
          ${testConnectionButton}
        </div>
      </header>

      <main class="visual-grid">
        <section class="section-card">
          <div class="section-card__header">
            <div class="section-card__title">
              <span class="badge badge--glow">🌐</span>
              <h2>${escapeHtml(String(languageSettings))}</h2>
            </div>
            <div class="section-card__actions">
              ${diagnoseButton}
            </div>
          </div>
          <p class="section-card__hint">
            ${escapeHtml(String(languageHint))} · ${escapeHtml(String(featureNote))}
          </p>
          <div class="language-selector">
            <label for="languageSelect">${escapeHtml(String(languageLabel))}</label>
            <select id="languageSelect">
              ${languageOptions}
            </select>
          </div>
        </section>

        <section class="section-card">
          <div class="section-card__header">
            <div class="section-card__title">
              <span class="badge badge--stats">📊</span>
              <h2>${escapeHtml(String(resource.get('usageDashboardTitle')))}</h2>
            </div>
          </div>
          <p class="section-card__hint">${escapeHtml(String(resource.get('usageDashboardSubtitle')))}</p>
          <div class="section-card__metrics">
            ${usageMetrics}
          </div>
        </section>
      </main>
    </div>
  </body>
</html>`;
}
