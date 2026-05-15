import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import { previewContent } from '@options/stitch/content';
import {
  applyOptionsToState,
  createInitialStitchState,
  createProductionContent
} from '@options/app/productionStitchStateMapper';
import {
  createSchemaContext,
  expectProductionText,
  expectSettingsSchemas
} from '../../../utils/productionStitchAssertions';
import { getSettingsView } from '@options/stitch/schema/registry';

describe('reading settings', () => {
  it('is represented by production Stitch content and schemas', () => {
    expectSettingsSchemas(
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    );
    expect(getSettingsView('overview', createSchemaContext())).toBeTruthy();
    expectProductionText('Reading Session', 'Reading Overlay Summary', 'highlight');
  });

  it('maps reading session options into production Stitch state', () => {
    const options = mergeOptions({
      readingSession: {
        ...DEFAULT_OPTIONS.readingSession!,
        exportMode: 'full',
        highlightTheme: 'neonOrange'
      }
    } as Partial<CompleteOptions>) as CompleteOptions;

    const content = createProductionContent(previewContent, options);
    const state = applyOptionsToState(createInitialStitchState(content), options, content);

    expect(state).toEqual(
      expect.objectContaining({
        readingExportMode: 'full',
        highlightTheme: 'neonOrange'
      })
    );
  });
});
