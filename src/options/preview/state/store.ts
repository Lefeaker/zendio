import { createSchemaStore, type SchemaStore } from '@options/schema-runtime/store';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';

export type PreviewStore = SchemaStore<PreviewStoreState>;

function createYamlFieldStates(appData: PreviewContent): Record<string, string> {
  const states: Record<string, string> = {};
  for (const group of appData.output.yamlRows) {
    for (const [field, , modes] of group.rows) {
      for (const [mode, status] of Object.entries(modes)) {
        states[`${field}:${mode}`] = status;
      }
    }
  }
  return states;
}

export function createInitialState(appData: PreviewContent): PreviewStoreState {
  return {
    activePanel: 'overview',
    activeResource: null,
    previewTheme: 'dark',
    previewLanguage: 'zh-CN',
    yamlFilter: 'all',
    readingPathMode: 'custom',
    pageSummaryEnabled: false,
    readingOverlaySummaryEnabled: false,
    subtitleTranslationEnabled: false,
    subtitleTargetLanguage: 'zh-CN',
    experimentalAiConfig: { ...appData.experimental.aiDefaults },
    highlightTheme: 'gradient',
    readingExportMode: 'full',
    aiUserName: 'USER',
    aiIncludeTimestamps: false,
    deepResearchPureMode: false,
    videoFloatingPromptEnabled: true,
    videoPromptButtonLabel: '开启视频笔记',
    videoPromptShortcut: 'Alt+V',
    fragmentUseFootnoteFormat: true,
    fragmentCaptureContext: true,
    fragmentContextLength: 200,
    fragmentContextMode: 'chars',
    fragmentKeyboardShortcutsEnabled: true,
    fragmentModifierEnabled: true,
    modifierKeys: ['Alt'],
    yamlFieldStates: createYamlFieldStates(appData),
    routingRules: appData.storage.routingRules.map((rule) => ({ ...rule })),
    templateValues: { ...appData.output.templateDefaults },
    activeTemplateField: 'articleVideo',
    pendingTemplateFocus: null,
    pendingTemplateSelection: null
  };
}

export function createStore(
  appData: PreviewContent,
  onChange: (state: PreviewStoreState) => void
): PreviewStore {
  return createSchemaStore(createInitialState(appData), onChange);
}
