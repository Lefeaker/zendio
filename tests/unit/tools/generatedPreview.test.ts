import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createGeneratedPreview } from '../../visual/utils/generatedPreview';

function readAssets(entry: string) {
  return ['index.html', 'index.js', 'styles.css'].map((name) => {
    const path = join(dirname(entry), name);
    return { name, hash: createHash('sha256').update(readFileSync(path)).digest('hex') };
  });
}

describe('generated visual preview ownership', () => {
  it('keeps live assets intact when another owner builds and cleans up', () => {
    const first = createGeneratedPreview();
    const second = createGeneratedPreview();
    try {
      const firstEntry = first.build();
      const firstScript = join(dirname(firstEntry), 'index.js');
      const firstIdentity = statSync(firstScript).ino;
      const firstAssets = readAssets(firstEntry);
      const secondEntry = second.build();

      expect(statSync(firstScript).ino).toBe(firstIdentity);
      expect(readAssets(firstEntry)).toEqual(firstAssets);
      expect(readAssets(secondEntry)).toEqual(firstAssets);
      expect(first.build()).toBe(firstEntry);

      first.dispose();
      expect(existsSync(firstEntry)).toBe(false);
      expect(readAssets(secondEntry)).toEqual(firstAssets);
      expect(second.build()).toBe(secondEntry);

      const rebuiltEntry = first.build();
      expect(readAssets(rebuiltEntry)).toEqual(firstAssets);
      expect(readAssets(secondEntry)).toEqual(firstAssets);
      second.dispose();
      expect(existsSync(secondEntry)).toBe(false);
      expect(readAssets(rebuiltEntry)).toEqual(firstAssets);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it('allocates lazily and removes partial output when the real build fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'preview-build-failure-'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.stubEnv('TMPDIR', root);
    const preview = createGeneratedPreview();
    try {
      expect(readdirSync(root)).toEqual([]);
      expect(() => preview.build()).toThrow();
      expect(readdirSync(root)).toEqual([]);
      preview.dispose();
      expect(readdirSync(root)).toEqual([]);
    } finally {
      cwd.mockRestore();
      vi.unstubAllEnvs();
      preview.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
