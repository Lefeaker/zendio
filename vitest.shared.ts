import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const projectRoot = dirname(fileURLToPath(new URL(import.meta.url)));
const srcDir = resolvePath(projectRoot, 'src');

export function createVitestAliases(options: { includeLegacySrcPattern?: boolean } = {}) {
  const aliases = [
    {
      find: '@shared',
      replacement: resolvePath(srcDir, 'shared')
    },
    {
      find: '@content',
      replacement: resolvePath(srcDir, 'content')
    },
    {
      find: '@options',
      replacement: resolvePath(srcDir, 'options')
    },
    {
      find: '@ui',
      replacement: resolvePath(srcDir, 'ui')
    },
    {
      find: '@i18n',
      replacement: resolvePath(srcDir, 'i18n')
    },
    {
      find: '@platform',
      replacement: resolvePath(srcDir, 'platform')
    },
    {
      find: '@third-party',
      replacement: resolvePath(srcDir, 'third_party')
    }
  ];

  if (options.includeLegacySrcPattern) {
    aliases.push({
      find: /^(\.\.\/)+src\//,
      replacement: `${srcDir}/`
    });
  }

  return aliases;
}
