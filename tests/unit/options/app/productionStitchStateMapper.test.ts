import { describe, expect, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import { previewContent } from '@options/stitch/content';
import {
  applyOptionsToState,
  createInitialStitchState,
  createProductionContent,
  resolveReadingPathMode,
  toRoutingRules,
  toTemplateValues
} from '@options/app/productionStitchStateMapper';
import type { CompleteOptions } from '@shared/types/options';

function options(overrides: Partial<CompleteOptions> = {}): CompleteOptions {
  return mergeOptions(overrides) as CompleteOptions;
}

describe('production Stitch state mapper', () => {
  it('maps templates and reading path mode from options', () => {
    const mapped = toTemplateValues(
      options({
        templates: {
          article: 'Articles/{slug}.md',
          fragment: 'Fragments/{slug}.md',
          reading: 'Reading/{slug}.md',
          ai: 'AI/{title}.md'
        }
      } as Partial<CompleteOptions>)
    );

    expect(mapped).toEqual({
      articleVideo: 'Articles/{slug}.md',
      fragment: 'Fragments/{slug}.md',
      readingCustom: 'Reading/{slug}.md',
      aiChat: 'AI/{title}.md'
    });

    const articleModeOptions = options();
    articleModeOptions.templates.reading = articleModeOptions.templates.article;
    expect(resolveReadingPathMode(articleModeOptions)).toBe('article');
  });

  it('deduplicates vault routing rules for Stitch state', () => {
    const draft = options();
    draft.rest.vault = 'Research';
    draft.vaultRouter = {
      defaultVaultId: 'default',
      vaults: [
        {
          id: 'default',
          name: 'Research',
          vault: 'Research',
          httpsUrl: draft.rest.httpsUrl ?? draft.rest.baseUrl,
          httpUrl: draft.rest.httpUrl ?? draft.rest.baseUrl,
          apiKey: draft.rest.apiKey,
          rules: []
        }
      ],
      rules: [
        {
          id: 'one',
          vaultId: 'default',
          type: 'domain',
          pattern: 'example.com',
          priority: 10,
          enabled: true
        },
        {
          id: 'one',
          vaultId: 'default',
          type: 'domain',
          pattern: 'example.com',
          priority: 10,
          enabled: true
        }
      ]
    };

    const mapped = toRoutingRules(draft);

    expect(mapped).toEqual([
      {
        type: 'Domain',
        pattern: 'example.com',
        target: 'Research',
        priority: 10,
        enabled: true
      }
    ]);
  });

  it('creates production content and applies option state', () => {
    const draft = options({ aiChat: { userName: 'Tester' } } as Partial<CompleteOptions>);
    const content = createProductionContent(previewContent, draft);
    const state = applyOptionsToState(createInitialStitchState(content), draft, content);

    expect(content.brand.title).toBe('All in Ob');
    expect(content.surfaceLinks).toEqual([]);
    expect(state.aiUserName).toBe('Tester');
    expect(state.templateValues.articleVideo).toBe(draft.templates.article);
  });
});
