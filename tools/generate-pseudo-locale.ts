import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import en from '../src/i18n/locales/en';
import type { LocaleDefinition } from '../src/i18n/localeDefinition';
import { pseudoLocalizeMessages, pseudoLocalizeStatic } from '../src/i18n/pseudoLocalization';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'src/i18n/locales/qps-ploc.ts');

function generateContent(locale: LocaleDefinition): string {
  const header = `import type { LocaleDefinition } from '../localeDefinition';
import type { Messages } from '../messages';

const runtime: Messages = ${JSON.stringify(locale.runtime, null, 2)};

const qpsPloc: LocaleDefinition = {
  runtime,
  static: ${JSON.stringify(locale.static, null, 2)}
};

export default qpsPloc;
`;
  return header;
}

async function main(): Promise<void> {
  const pseudoLocale: LocaleDefinition = {
    runtime: pseudoLocalizeMessages(en.runtime),
    static: pseudoLocalizeStatic(en.static)
  };

  const content = generateContent(pseudoLocale);
  await fs.writeFile(OUTPUT_FILE, `${content}\n`, 'utf8');
  console.log(`✅ Pseudo locale regenerated at ${path.relative(ROOT, OUTPUT_FILE)}`);
}

main().catch((error) => {
  console.error('Failed to generate pseudo locale');
  console.error(error);
  process.exitCode = 1;
});
