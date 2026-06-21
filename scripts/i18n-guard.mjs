import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { installI18nAssetFetch } from './utils/install-i18n-asset-fetch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

installI18nAssetFetch();
const LENGTH_RATIO_THRESHOLD = 1.3;

function stripPlaceholders(value) {
  return value.replace(/\{[^}]+\}/g, '').trim();
}

function measureLength(value) {
  return [...value].length;
}

function resolveShortKey(key, budget) {
  return budget?.shortKey ?? `${key}_short`;
}

async function bundleModule(filePath) {
  const result = await build({
    entryPoints: [filePath],
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    target: 'node20',
    logLevel: 'silent'
  });

  const { text } = result.outputFiles[0];
  const dataUrl = `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  return import(dataUrl);
}

async function loadLocaleApi() {
  const modulePath = path.join(ROOT, 'src/i18n/locales.ts');
  const mod = await bundleModule(modulePath);
  if (typeof mod.getLocaleCodes !== 'function' || typeof mod.loadLocaleMessages !== 'function') {
    throw new Error('Failed to load locale API from src/i18n/locales.ts');
  }
  return mod;
}

async function loadLocaleDefinition(localeApi, code) {
  return {
    runtime: await localeApi.loadLocaleMessages(code)
  };
}

async function loadBudgets() {
  const modulePath = path.join(ROOT, 'src/shared/i18n/budgets.ts');
  const mod = await bundleModule(modulePath);
  if (!mod.TEXT_BUDGETS || !mod.getTextBudget) {
    throw new Error('Failed to load TEXT_BUDGETS from src/shared/i18n/budgets.ts');
  }
  return {
    budgets: mod.TEXT_BUDGETS,
    getTextBudget: mod.getTextBudget
  };
}

async function loadGlossaryModule() {
  const modulePath = path.join(ROOT, 'src/i18n/glossary.ts');
  const mod = await bundleModule(modulePath);
  if (typeof mod.validateGlossary !== 'function') {
    throw new Error('Failed to load validateGlossary from src/i18n/glossary.ts');
  }
  return mod;
}

function flattenMessages(record, prefix = '', output = {}) {
  for (const [key, value] of Object.entries(record)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      output[nextKey] = value;
    } else if (value && typeof value === 'object') {
      flattenMessages(value, nextKey, output);
    }
  }
  return output;
}

async function main() {
  const localeApi = await loadLocaleApi();
  const localeCodes = localeApi.getLocaleCodes();

  if (!localeCodes.includes('en')) {
    throw new Error('Missing baseline locale "en".');
  }

  const baseline = await loadLocaleDefinition(localeApi, 'en');
  const baselineMessages = flattenMessages(baseline.runtime);

  const localeMap = new Map();
  localeMap.set('en', baselineMessages);

  for (const code of localeCodes) {
    if (code === 'en') continue;
    const current = await loadLocaleDefinition(localeApi, code);
    localeMap.set(code, flattenMessages(current.runtime));
  }

  const { budgets, getTextBudget } = await loadBudgets();
  const errors = [];
  const warnings = [];

  for (const [key, budget] of Object.entries(budgets)) {
    const baselineValue = baselineMessages[key];
    const baselineLength = typeof baselineValue === 'string' ? measureLength(stripPlaceholders(baselineValue)) : 0;
    const expectedShortKey = resolveShortKey(key, budget);

    for (const [language, messages] of localeMap.entries()) {
      if (language === 'qps-ploc') {
        continue;
      }

      const translated = messages[key];
      if (typeof translated !== 'string') {
        continue;
      }

      const clean = stripPlaceholders(translated);
      const length = measureLength(clean);
      const effectiveBudget = getTextBudget(key, language);

      if (!effectiveBudget) {
        continue;
      }

      if (length > effectiveBudget.desktop) {
        errors.push(
          `[${language}] "${key}" exceeds desktop budget (${length} > ${effectiveBudget.desktop}) [${effectiveBudget.priority}]`
        );
        continue;
      }

      const shortCandidate = messages[expectedShortKey];
      const shortLength =
        typeof shortCandidate === 'string' ? measureLength(stripPlaceholders(shortCandidate)) : undefined;

      if (length > effectiveBudget.mobile) {
        if (shortLength === undefined) {
          errors.push(
            `[${language}] "${key}" exceeds mobile budget (${length} > ${effectiveBudget.mobile}) but short variant "${expectedShortKey}" is missing`
          );
          continue;
        }
        if (shortLength > effectiveBudget.mobile) {
          errors.push(
            `[${language}] "${expectedShortKey}" exceeds mobile budget (${shortLength} > ${effectiveBudget.mobile})`
          );
        }
      } else if (shortLength === undefined && baselineLength > 0) {
        const ratio = length / baselineLength;
        if (ratio >= LENGTH_RATIO_THRESHOLD) {
          warnings.push(
            `[${language}] "${key}" is ${ratio.toFixed(2)}× longer than baseline and lacks short variant "${expectedShortKey}"`
          );
        }
      }

      if (budget.shortKey && shortLength === undefined) {
        warnings.push(`[${language}] missing required short variant "${expectedShortKey}" for "${key}"`);
      }
    }
  }

  const glossaryModule = await loadGlossaryModule();
  const { validateGlossary, GLOSSARY_RULES } = glossaryModule;

  for (const [language, messages] of localeMap.entries()) {
    const violations = validateGlossary(messages, language, GLOSSARY_RULES);
    for (const violation of violations) {
      if (violation.severity === 'error') {
        errors.push(`[glossary] ${violation.message}`);
      } else {
        warnings.push(`[glossary] ${violation.message}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('[i18n-guard] Blocking issues detected:');
    for (const entry of errors) {
      console.error(`- ${entry}`);
    }
    process.exitCode = 1;
  }

  if (warnings.length > 0) {
    console.warn('[i18n-guard] Warnings detected:');
    for (const entry of warnings) {
      console.warn(`- ${entry}`);
    }
  }

  if (errors.length === 0) {
    console.log('[i18n-guard] Translation guard checks passed.');
  }
}

main().catch((error) => {
  console.error('[i18n-guard] Failed to run translation guard.');
  console.error(error);
  process.exitCode = 1;
});
