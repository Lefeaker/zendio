import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'src/i18n/locales');
const CHROME_LOCALES_DIR = path.join(ROOT, 'public', '_locales');

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

function extractPlaceholders(value) {
  const matches = value.matchAll(/\{(\w+)\}/g);
  const set = new Set();
  for (const match of matches) {
    set.add(match[1]);
  }
  return set;
}

function diffPlaceholders(baseValue, targetValue) {
  const base = extractPlaceholders(baseValue);
  const target = extractPlaceholders(targetValue);

  const missing = [...base].filter((key) => !target.has(key));
  const extra = [...target].filter((key) => !base.has(key));
  return { missing, extra };
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

async function loadLocale(code) {
  const modulePath = path.join(LOCALES_DIR, `${code}.ts`);
  const mod = await bundleModule(modulePath);
  if (!mod.default) {
    throw new Error(`Locale module ${code} does not export default locale definition.`);
  }
  return mod.default;
}

async function loadBudgetModule() {
  const modulePath = path.join(ROOT, 'src/shared/i18n/budgets.ts');
  const mod = await bundleModule(modulePath);
  if (!mod.TEXT_BUDGETS) {
    throw new Error('Failed to load TEXT_BUDGETS from src/shared/i18n/budgets.ts');
  }
  return mod;
}

async function loadLanguageConfig() {
  const modulePath = path.join(ROOT, 'src/i18n/config.ts');
  const mod = await bundleModule(modulePath);
  if (
    !mod.LANGUAGE_CONFIG
    || typeof mod.getConfiguredLanguageCodes !== 'function'
    || typeof mod.getWebExtensionLocaleFolder !== 'function'
  ) {
    throw new Error(
      'Failed to load LANGUAGE_CONFIG/getConfiguredLanguageCodes/getWebExtensionLocaleFolder from src/i18n/config.ts'
    );
  }
  return mod;
}

async function loadGlossaryModule() {
  const modulePath = path.join(ROOT, 'src/i18n/glossary.ts');
  const mod = await bundleModule(modulePath);
  if (typeof mod.validateGlossary !== 'function') {
    throw new Error('Failed to load validateGlossary from src/i18n/glossary.ts');
  }
  return mod;
}

function stripPlaceholders(value) {
  return value.replace(/\{[^}]+\}/g, '').trim();
}

function evaluateBudgets(localeRuntimeMap, budgets, resolveBudgetForLanguage) {
  const errors = [];
  const warnings = [];

  for (const [key, budget] of Object.entries(budgets)) {
    for (const [language, messages] of Object.entries(localeRuntimeMap)) {
      if (language === 'qps-ploc') {
        continue; // pseudo locale intentionally inflates length
      }

      const effectiveBudget = resolveBudgetForLanguage(key, language);
      if (!effectiveBudget) {
        continue;
      }

      const messageValue = messages[key];
      if (typeof messageValue !== 'string') {
        continue;
      }

      const clean = stripPlaceholders(messageValue);
      const length = [...clean].length; // account for surrogate pairs / emoji

      if (length > effectiveBudget.desktop) {
        errors.push(
          `[budget:${key}] "${language}" exceeds desktop budget (${length} > ${effectiveBudget.desktop}) [${effectiveBudget.priority}]`
        );
      } else if (length > effectiveBudget.mobile) {
        warnings.push(
          `[budget:${key}] "${language}" exceeds mobile budget (${length} > ${effectiveBudget.mobile}) [${effectiveBudget.priority}]`
        );
      }
    }
  }

  return { errors, warnings };
}

async function main() {
  const files = await fs.readdir(LOCALES_DIR);
  const localeCodes = files.filter((file) => file.endsWith('.ts')).map((file) => file.replace(/\.ts$/, ''));

  if (!localeCodes.includes('en')) {
    throw new Error('English locale (en.ts) is required as baseline for linting.');
  }

  const baseline = await loadLocale('en');
  const baselineRuntime = flattenMessages(baseline.runtime);
  const localeRuntimeMap = {
    en: baselineRuntime
  };

  const errors = [];

  for (const code of localeCodes) {
    if (code === 'en') {
      continue;
    }

    const current = await loadLocale(code);
    const currentRuntime = flattenMessages(current.runtime);
    localeRuntimeMap[code] = currentRuntime;

    const missingRuntimeKeys = [];
    const extraRuntimeKeys = [];

    for (const key of Object.keys(baselineRuntime)) {
      if (!(key in currentRuntime)) {
        missingRuntimeKeys.push(key);
      }
    }

    for (const key of Object.keys(currentRuntime)) {
      if (!(key in baselineRuntime)) {
        extraRuntimeKeys.push(key);
      }
    }

    if (missingRuntimeKeys.length > 0) {
      errors.push(`[${code}] missing runtime keys:\n  - ${missingRuntimeKeys.join('\n  - ')}`);
    }

    if (extraRuntimeKeys.length > 0) {
      errors.push(`[${code}] has extra runtime keys:\n  - ${extraRuntimeKeys.join('\n  - ')}`);
    }

    for (const [key, baseValue] of Object.entries(baselineRuntime)) {
      const targetValue = currentRuntime[key];
      if (typeof targetValue !== 'string') {
        continue;
      }
      const { missing, extra } = diffPlaceholders(baseValue, targetValue);
      if (missing.length > 0 || extra.length > 0) {
        const issues = [];
        if (missing.length > 0) {
          issues.push(`missing {${missing.join(', ')}}`);
        }
        if (extra.length > 0) {
          issues.push(`unexpected {${extra.join(', ')}}`);
        }
        errors.push(`[${code}] placeholder mismatch at "${key}": ${issues.join('; ')}`);
      }
    }
  }

  // Budget evaluation
  const budgetModule = await loadBudgetModule();
  const budgets = budgetModule.TEXT_BUDGETS;
  const resolveBudgetForLanguage =
    budgetModule.getTextBudget && typeof budgetModule.getTextBudget === 'function'
      ? (key, language) => budgetModule.getTextBudget(key, language)
      : (key) => budgets[key];

  const { errors: budgetErrors, warnings: budgetWarnings } = evaluateBudgets(
    localeRuntimeMap,
    budgets,
    resolveBudgetForLanguage
  );
  errors.push(...budgetErrors);

  const glossaryModule = await loadGlossaryModule();
  const { validateGlossary, GLOSSARY_RULES } = glossaryModule;

  for (const [language, messages] of Object.entries(localeRuntimeMap)) {
    const violations = validateGlossary(messages, language, GLOSSARY_RULES);
    for (const violation of violations) {
      if (violation.severity === 'error') {
        errors.push(`[glossary] ${violation.message}`);
      } else {
        warnings.push(`[glossary] ${violation.message}`);
      }
    }
  }

  if (budgetWarnings.length > 0) {
    console.warn('[lint-i18n] Budget warnings detected:');
    for (const warning of budgetWarnings) {
      console.warn(`- ${warning}`);
    }
  }

  const languageConfigModule = await loadLanguageConfig();
  const { errors: chromeErrors, warnings: chromeWarnings } =
    await validateChromeLocales(languageConfigModule);
  errors.push(...chromeErrors);

  if (chromeWarnings.length > 0) {
    console.warn('[lint-i18n] Chrome _locales warnings detected:');
    for (const warning of chromeWarnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error('[lint-i18n] Found i18n issues:');
    for (const message of errors) {
      console.error(`- ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[lint-i18n] All locale files passed consistency checks.');
}

main().catch((error) => {
  console.error('[lint-i18n] Failed to lint locale files.');
  console.error(error);
  process.exitCode = 1;
});

async function loadChromeLocale(folder) {
  const filePath = path.join(CHROME_LOCALES_DIR, folder, 'messages.json');
  const raw = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  const entries = Object.entries(data).filter(([key]) => !key.startsWith('@@'));
  const map = {};
  for (const [key, descriptor] of entries) {
    if (descriptor && typeof descriptor.message === 'string') {
      map[key] = descriptor.message;
    }
  }
  return map;
}

async function validateChromeLocales(languageConfigModule) {
  const { getConfiguredLanguageCodes, getWebExtensionLocaleFolder } = languageConfigModule;
  let chromeFolders = [];
  try {
    chromeFolders = await fs.readdir(CHROME_LOCALES_DIR);
  } catch (error) {
    if ((error?.code ?? '') === 'ENOENT') {
      return { errors: ['[chrome] public/_locales directory not found.'], warnings: [] };
    }
    throw error;
  }

  if (!chromeFolders.includes('en')) {
    return { errors: ['[chrome] Missing baseline folder public/_locales/en'], warnings: [] };
  }

  const baseline = await loadChromeLocale('en');
  const usedFolders = new Set(['en']);
  const errors = [];
  const warnings = [];

  const languageCodes = getConfiguredLanguageCodes();
  for (const code of languageCodes) {
    if (code === 'qps-ploc') {
      continue;
    }
    const folder = getWebExtensionLocaleFolder(code);
    if (!chromeFolders.includes(folder)) {
      errors.push(`[chrome:${code}] Missing Chrome locale folder ${folder}`);
      continue;
    }

    usedFolders.add(folder);
    const staticMessages = await loadChromeLocale(folder);

    const missingKeys = [];
    for (const key of Object.keys(baseline)) {
      if (!(key in staticMessages)) {
        missingKeys.push(key);
      }
    }
    if (missingKeys.length > 0) {
      errors.push(
        `[chrome:${code}] Missing static keys compared to en:
  - ${missingKeys.join('\n  - ')}`
      );
    }

    const extraKeys = Object.keys(staticMessages).filter((key) => !(key in baseline));
    if (extraKeys.length > 0) {
      warnings.push(
        `[chrome:${code}] Has extra static keys not present in en:
  - ${extraKeys.join('\n  - ')}`
      );
    }
  }

  const configuredFolderSet = new Set(
    languageCodes.filter((code) => code !== 'qps-ploc').map((code) => getWebExtensionLocaleFolder(code))
  );
  const unusedFolders = chromeFolders.filter(
    (folder) => !usedFolders.has(folder) && !configuredFolderSet.has(folder)
  );
  for (const folder of unusedFolders) {
    warnings.push(`[chrome:${folder}] No runtime language maps to this Chrome locale folder.`);
  }

  return { errors, warnings };
}
