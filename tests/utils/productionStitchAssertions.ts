import { expect } from 'vitest';
import { previewContent } from '@options/stitch/content';
import { settingsSchemas } from '@options/stitch/schema/registry';
import type { PreviewStoreState, SchemaContext } from '@options/stitch/types';

export function productionStitchText(): string {
  return JSON.stringify(previewContent);
}

export function expectProductionText(...terms: string[]): void {
  const text = productionStitchText();
  for (const term of terms) {
    expect(text).toContain(term);
  }
}

export function expectSettingsSchemas(...ids: string[]): void {
  for (const id of ids) {
    expect(settingsSchemas[id]).toBeTruthy();
  }
}

export function createSchemaContext(): SchemaContext {
  return {
    appData: previewContent,
    state: {
      activePanel: 'overview',
      activeResource: null,
      previewTheme: 'dark',
      previewLanguage: 'en',
      yamlFilter: 'article',
      readingPathMode: 'domain',
      pageSummaryEnabled: false,
      readingOverlaySummaryEnabled: false,
      subtitleTranslationEnabled: false,
      subtitleTargetLanguage: 'en',
      experimentalAiConfig: { ...previewContent.experimental.aiDefaults },
      highlightTheme: 'yellow',
      fragmentModifierEnabled: true,
      modifierKeys: ['shift'],
      yamlFieldStates: {},
      routingRules: [...previewContent.storage.routingRules],
      templateValues: { ...previewContent.output.templateDefaults },
      activeTemplateField: 'articleVideo',
      pendingTemplateFocus: null,
      pendingTemplateSelection: null
    } satisfies PreviewStoreState
  };
}
