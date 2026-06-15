import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../');

const previewReachableFiles = [
  'src/options/yaml-config-editor/labels.ts',
  'src/options/app/fragmentModifierOptions.ts',
  'src/options/stitch/schema/i18n.ts'
] as const;

describe('preview i18n import graph', () => {
  it('keeps preview-reachable options modules off the @i18n runtime barrel', () => {
    for (const relativePath of previewReachableFiles) {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');

      expect(source).not.toMatch(/import\s+\{[^}]+\}\s+from\s+['"]@i18n['"]/);
      expect(source).not.toContain('DEFAULT_RUNTIME_MESSAGES');
    }
  });

  it('uses the lightweight message formatter entry where formatting is needed', () => {
    const fragmentModifierSource = readFileSync(
      path.join(repoRoot, 'src/options/app/fragmentModifierOptions.ts'),
      'utf8'
    );
    const schemaI18nSource = readFileSync(
      path.join(repoRoot, 'src/options/stitch/schema/i18n.ts'),
      'utf8'
    );

    expect(fragmentModifierSource).toMatch(/from ['"]@i18n\/messageFormatter['"]/);
    expect(schemaI18nSource).toMatch(/from ['"]@i18n\/messageFormatter['"]/);
  });
});
