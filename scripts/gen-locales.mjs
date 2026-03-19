import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'src/i18n/locales');
const OUTPUT_ROOT = path.join(ROOT, 'public', '_locales');

const CHROME_CODE_MAP = {
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW',
  'pt-BR': 'pt_BR',
  'es-ES': 'es',
  'es-419': 'es_419'
};

async function bundleLocaleModule(filePath) {
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

async function loadLocaleDefinitions(localeCodes) {
  const definitions = new Map();
  for (const code of localeCodes) {
    const modulePath = path.join(LOCALES_DIR, `${code}.ts`);
    const mod = await bundleLocaleModule(modulePath);
    const definition = mod.default;
    if (!definition) {
      throw new Error(`Locale module ${code} does not export a default locale definition.`);
    }
    definitions.set(code, definition);
  }
  return definitions;
}

function ensureOrderedUnique(values) {
  const seen = new Set();
  const ordered = [];
  for (const value of values) {
    if (value && !seen.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  }
  return ordered;
}

function buildStaticMessages(code, chain, definitions, staticKeys) {
  const orderedChain = ensureOrderedUnique(chain);
  const definition = definitions.get(code);
  if (!definition) {
    throw new Error(`Missing locale definition for ${code}`);
  }

  const messages = {};
  for (const key of staticKeys) {
    let resolved = definition.static?.[key];
    if (!resolved) {
      for (const fallbackCode of orderedChain) {
        const fallback = definitions.get(fallbackCode);
        resolved = fallback?.static?.[key];
        if (resolved) {
          break;
        }
      }
    }

    if (!resolved) {
      throw new Error(`Missing static translation "${key}" for locale ${code}.`);
    }

    messages[key] = { message: resolved };
  }

  return messages;
}

function resolveChromeLocaleCode(code) {
  return CHROME_CODE_MAP[code] ?? code;
}

async function writeChromeMessages(chromeCode, messages) {
  const localeDir = path.join(OUTPUT_ROOT, chromeCode);
  await fs.mkdir(localeDir, { recursive: true });
  const filePath = path.join(localeDir, 'messages.json');
  const content = `${JSON.stringify(messages, null, 2)}\n`;
  await fs.writeFile(filePath, content, 'utf8');
}

async function main() {
  const files = await fs.readdir(LOCALES_DIR);
  const localeCodes = files.filter((file) => file.endsWith('.ts')).map((file) => file.replace(/\.ts$/, ''));

  if (!localeCodes.includes('en')) {
    throw new Error('English locale (en.ts) is required as fallback');
  }

  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const configModule = await bundleLocaleModule(path.join(ROOT, 'src/i18n/config.ts'));
  const getLanguageFallbackChain = configModule.getLanguageFallbackChain;
  const staticKeys = configModule.CHROME_STATIC_KEYS ?? ['extName', 'extDescription'];
  if (typeof getLanguageFallbackChain !== 'function') {
    throw new Error('Failed to load getLanguageFallbackChain from config module');
  }

  const localeDefinitions = await loadLocaleDefinitions(localeCodes);

  for (const code of localeCodes) {
    const chromeCode = resolveChromeLocaleCode(code);
    const chain = getLanguageFallbackChain(code);
    const messages = buildStaticMessages(code, chain, localeDefinitions, staticKeys);
    await writeChromeMessages(chromeCode, messages);
  }
}

main().catch((error) => {
  console.error('[gen-locales] Failed to generate Chrome locale files');
  console.error(error);
  process.exitCode = 1;
});
