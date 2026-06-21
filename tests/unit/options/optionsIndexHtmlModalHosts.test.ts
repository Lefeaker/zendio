import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('options index modal hosts', () => {
  it('removes legacy compat hosts and leaves only schema-shell mount points', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/options/index.html'), 'utf8');

    expect(source).toContain('id="optionsShellRoot"');
    expect(source).toContain('data-preview-skin="stitch-secondary"');
    expect(source).toContain('./stitch/styles/stitch.css');
    expect(source).toContain('./stitch/styles/variants/stitch-secondary.css');
    expect(source).not.toContain('../styles/global.tailwind.css');
    expect(source).not.toContain('./styles/tailwind.css');
    expect(source).not.toContain('id="theme-switcher"');
    expect(source).not.toContain('id="supportModal"');
    expect(source).not.toContain('id="suggestionsModal"');
    expect(source).not.toContain('id="contactModal"');
    expect(source).not.toContain('id="changelogModal"');
    expect(source).not.toContain('id="suggestionsXhsTrigger"');
    expect(source).not.toContain('id="suggestionsXhsQr"');
    expect(source).not.toContain('id="changelogContent"');

    expect(source).not.toContain('感谢支持');
    expect(source).not.toContain('提出建议');
    expect(source).not.toContain('联系作者');
    expect(source).not.toContain('更新日志');
    expect(source).not.toContain('Ko-fi');
    expect(source).not.toContain('爱发电');
    expect(source).not.toContain('Reddit 社区');
    expect(source).not.toContain('GitHub Issue');

    const built = resolve(process.cwd(), 'build/dist/options/index.html');
    if (existsSync(built)) {
      const builtSource = readFileSync(built, 'utf8');
      expect(builtSource).toContain('./stitch/styles/stitch.css');
      expect(builtSource).toContain('./stitch/styles/variants/stitch-secondary.css');
      expect(builtSource).not.toContain('../styles/global.tailwind.css');
      expect(builtSource).not.toContain('./styles/tailwind.css');
    }
  });

  it('loads onboarding from Stitch styles without the retired global bridge', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/onboarding/index.html'), 'utf8');

    expect(source).toContain('../options/stitch/styles/stitch.css');
    expect(source).toContain('../options/stitch/styles/variants/stitch-secondary.css');
    expect(source).toMatch(/<html\b[^>]*\blang="en"[^>]*\bdata-route="onboarding"/su);
    expect(source).toContain('<title>Zendio</title>');
    expect(source).toContain('data-preview-skin="stitch-secondary"');
    expect(source).not.toContain('../styles/global.tailwind.css');
    expect(source).not.toContain('../styles/design-tokens.css');
    expect(source).not.toContain('欢迎使用 Zendio');
    expect(source).not.toContain('Zendio - 欢迎使用');
  });
});
