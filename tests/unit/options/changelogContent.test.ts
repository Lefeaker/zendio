import { describe, expect, it } from 'vitest';
import { getChangelogByLanguage } from '@options/app/changelogContent';

describe('changelogContent compatibility fallback', () => {
  it('falls back to English for unsupported non-Chinese languages', () => {
    expect(getChangelogByLanguage('fr')).toContain('<h3>✨ Highlights</h3>');
    expect(getChangelogByLanguage('fr')).not.toContain('<h3>✨ 主要更新</h3>');
  });

  it('keeps the Chinese changelog only for zh-CN', () => {
    expect(getChangelogByLanguage('zh-CN')).toContain('<h3>✨ 主要更新</h3>');
    expect(getChangelogByLanguage('zh-CN')).not.toContain('<h3>✨ Highlights</h3>');
  });
});
