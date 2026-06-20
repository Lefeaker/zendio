import { describe, expect, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import { previewContent } from '@options/stitch/content';
import {
  applyOptionsToState,
  createInitialStitchState,
  createProductionContent
} from '@options/app/productionStitchStateMapper';
import type { CompleteOptions } from '@shared/types/options';

describe('production template settings', () => {
  it('maps edited template values into production Stitch state', () => {
    const options = mergeOptions({
      templates: {
        article: 'Articles/custom-article.md',
        video: 'Video/custom-video.md',
        fragment: 'Fragments/custom-fragment.md',
        reading: 'Reading/custom-reading.md',
        ai: 'AI/custom-ai.md'
      }
    } as Partial<CompleteOptions>) as CompleteOptions;

    const content = createProductionContent(previewContent, options);
    const state = applyOptionsToState(createInitialStitchState(content), options, content);

    expect(state.templateValues).toEqual(
      expect.objectContaining({
        articleVideo: 'Articles/custom-article.md',
        video: 'Video/custom-video.md',
        fragment: 'Fragments/custom-fragment.md',
        readingCustom: 'Reading/custom-reading.md',
        aiChat: 'AI/custom-ai.md'
      })
    );
    expect(state.readingPathMode).toBe('custom');
  });
});
