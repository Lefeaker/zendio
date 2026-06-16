import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../../..');

describe('public html titles', () => {
  it('keeps the local-vault permission shell title neutral until runtime localization applies', () => {
    const source = readFileSync(join(repoRoot, 'public/local-vault-permission.html'), 'utf8');

    expect(source).toContain('<title>Zendio</title>');
    expect(source).not.toContain('Local vault permission');
  });

  it('keeps the offscreen local-vault title neutral', () => {
    const source = readFileSync(join(repoRoot, 'public/offscreen/local-vault.html'), 'utf8');

    expect(source).toContain('<title>Zendio</title>');
    expect(source).not.toContain('local vault writer');
  });
});
