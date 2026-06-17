import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import {
  FALLBACK_YAML_EDITOR_LABELS,
  createYamlEditorLabels
} from '@options/yaml-config-editor/labels';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const labelsSourcePath = path.resolve(
  __dirname,
  '../../../../src/options/yaml-config-editor/labels.ts'
);

describe('YAML editor labels', () => {
  it('does not value-import the full i18n runtime fallback surface', () => {
    const source = readFileSync(labelsSourcePath, 'utf8');

    expect(source).not.toContain('DEFAULT_RUNTIME_MESSAGES');
    expect(source).not.toMatch(/import\s+\{[^}]+\}\s+from\s+['"]@i18n(?:\/locales)?['"]/);
  });

  it('keeps fallback labels aligned with the default English runtime messages', () => {
    expect(FALLBACK_YAML_EDITOR_LABELS).toEqual(createYamlEditorLabels(DEFAULT_RUNTIME_MESSAGES));
  });
});
