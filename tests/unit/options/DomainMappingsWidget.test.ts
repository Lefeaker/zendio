import { describe, expect, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import { previewContent } from '@options/stitch/content';
import { createProductionContent } from '@options/app/productionStitchStateMapper';
import type { CompleteOptions } from '@shared/types/options';

describe('production domain mappings settings', () => {
  it('maps domain aliases into production Stitch output content', () => {
    const options = mergeOptions({
      domainMappings: {
        'example.com': 'Example',
        'docs.example': 'Docs'
      }
    } as Partial<CompleteOptions>) as CompleteOptions;

    const content = createProductionContent(previewContent, options);

    expect(content.output.domainMappings).toEqual([
      ['example.com', 'Example', 'Production mapping'],
      ['docs.example', 'Docs', 'Production mapping']
    ]);
  });
});
