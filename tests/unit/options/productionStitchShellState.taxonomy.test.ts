/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { createInitialDraft, updateClassifierField } from '@options/app/productionStitchShellState';
import {
  applyOptionsToState,
  createInitialStitchState,
  createProductionContent
} from '@options/app/productionStitchStateMapper';
import { OptionsValidationError } from '@options/services/validation';
import { previewContent } from '@options/stitch/content';
import { DEFAULT_TAXONOMY_CONFIG } from '@shared/types/taxonomy';

const FULL_CATEGORY = {
  id: 'research',
  name: 'Research',
  description: 'Long-form research',
  descriptionKey: 'taxonomy.category.research.description',
  classificationHint: 'Prefer evidence-backed material',
  parent: 'knowledge',
  keywords: ['paper', 'study'],
  weight: 0.8
};

const FULL_TAG = {
  id: 'reviewed',
  name: 'Reviewed',
  description: 'Reviewed material',
  descriptionKey: 'taxonomy.tag.reviewed.description',
  classificationHint: 'Apply after review',
  category: 'workflow',
  color: '#336699',
  aliases: ['checked', 'verified']
};

const FULL_CONDITION = {
  type: 'metadata',
  operator: 'equals',
  value: 'paper',
  caseSensitive: true
};

const FULL_ACTION = {
  type: 'assignCategory',
  target: 'category',
  value: 'research',
  metadata: {
    source: 'taxonomy-editor',
    nested: { enabled: true },
    scores: [1, 2]
  }
};

const FULL_RULE = {
  id: 'research-rule',
  name: 'Research rule',
  description: 'Classify research documents',
  conditions: [FULL_CONDITION],
  actions: [FULL_ACTION],
  priority: 7,
  enabled: false
};

const FULL_TAXONOMY = {
  version: '2.0.0',
  name: 'Complete taxonomy',
  description: 'Every optional field is populated',
  descriptionKey: 'taxonomy.complete.description',
  classificationHint: 'Use the complete taxonomy',
  categories: [FULL_CATEGORY],
  tags: [FULL_TAG],
  rules: [FULL_RULE],
  defaultCategory: 'research',
  defaultTags: ['reviewed'],
  settings: {
    autoClassification: true,
    confidenceThreshold: 0.75,
    maxCategories: 3,
    maxTags: 5,
    fallbackBehavior: 'prompt',
    customPrompts: { research: 'Classify research material' }
  }
};

function createHarness() {
  const draft = createInitialDraft();
  const appData = createProductionContent(previewContent, draft);
  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  const scheduleDraftSave = vi.fn();
  return { draft, scheduleDraftSave, state };
}

describe('production taxonomy editor state boundary', () => {
  it('preserves every optional taxonomy field with exact deep equality', () => {
    const { draft, scheduleDraftSave, state } = createHarness();
    const editorText = JSON.stringify(FULL_TAXONOMY, null, 2);

    const result = updateClassifierField(draft, state, scheduleDraftSave, 'taxonomy', editorText);

    expect(result).toStrictEqual({ success: true });
    expect(draft.classifier.taxonomy).toStrictEqual(FULL_TAXONOMY);
    expect(state.classifierTaxonomyText).toBe(editorText);
    expect(scheduleDraftSave).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['invalid JSON', '{"version":'],
    [
      'invalid nested category',
      JSON.stringify({
        ...FULL_TAXONOMY,
        categories: [{ ...FULL_CATEGORY, keywords: ['paper', 7] }]
      })
    ],
    [
      'invalid nested condition enum',
      JSON.stringify({
        ...FULL_TAXONOMY,
        rules: [{ ...FULL_RULE, conditions: [{ ...FULL_CONDITION, type: 'unsupported' }] }]
      })
    ],
    [
      'invalid nested action enum',
      JSON.stringify({
        ...FULL_TAXONOMY,
        rules: [{ ...FULL_RULE, actions: [{ ...FULL_ACTION, type: 'unsupported' }] }]
      })
    ]
  ])('rejects %s without mutating or scheduling a save', (_label, editorText) => {
    const { draft, scheduleDraftSave, state } = createHarness();
    updateClassifierField(
      draft,
      state,
      scheduleDraftSave,
      'taxonomy',
      JSON.stringify(FULL_TAXONOMY)
    );
    scheduleDraftSave.mockClear();
    const previousTaxonomy = draft.classifier.taxonomy;
    const previousEditorText = state.classifierTaxonomyText;

    const result = updateClassifierField(draft, state, scheduleDraftSave, 'taxonomy', editorText);

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected taxonomy validation to fail');
    }
    expect(result.error).toBeInstanceOf(OptionsValidationError);
    expect(result.error.code).toBe('INVALID_TAXONOMY');
    expect(draft.classifier.taxonomy).toBe(previousTaxonomy);
    expect(state.classifierTaxonomyText).toBe(previousEditorText);
    expect(scheduleDraftSave).not.toHaveBeenCalled();
  });

  it('maps blank text to the valid default taxonomy instead of persisting an empty object', () => {
    const { draft, scheduleDraftSave, state } = createHarness();
    updateClassifierField(
      draft,
      state,
      scheduleDraftSave,
      'taxonomy',
      JSON.stringify(FULL_TAXONOMY)
    );
    scheduleDraftSave.mockClear();

    const result = updateClassifierField(draft, state, scheduleDraftSave, 'taxonomy', '');

    expect(result).toStrictEqual({ success: true });
    expect(draft.classifier.taxonomy).toStrictEqual(DEFAULT_TAXONOMY_CONFIG);
    expect(draft.classifier.taxonomy).not.toStrictEqual({});
    expect(state.classifierTaxonomyText).toBe('');
    expect(scheduleDraftSave).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown classifier fields without changing state or scheduling a save', () => {
    const { draft, scheduleDraftSave, state } = createHarness();
    const previousClassifier = structuredClone(draft.classifier);
    const previousEditorText = state.classifierTaxonomyText;

    const result = updateClassifierField(
      draft,
      state,
      scheduleDraftSave,
      'unknown-field',
      'ignored'
    );

    expect(result).toStrictEqual({ success: true });
    expect(draft.classifier).toStrictEqual(previousClassifier);
    expect(state.classifierTaxonomyText).toBe(previousEditorText);
    expect(scheduleDraftSave).not.toHaveBeenCalled();
  });
});
