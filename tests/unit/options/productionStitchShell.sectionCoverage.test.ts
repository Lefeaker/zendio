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
} from '../../utils/productionStitchAssertions';
import { getSettingsView } from '@options/stitch/schema/registry';

describe('production Stitch shell section coverage', () => {
  it('keeps retired non-REST section behavior represented by Stitch content and schemas', () => {
    expectSettingsSchemas(
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    );
    expect(getSettingsView('overview', createSchemaContext())).toBeTruthy();
    expectProductionText(
      'AI Chat',
      'ChatGPT',
      'Claude',
      'AI 页面总结',
      '模型连通性检查',
      'DeepSeek',
      'Tongyi',
      'Doubao',
      'Diagnostics',
      'Transfer',
      '诊断结果',
      '简体中文',
      'English',
      '日本語',
      'Privacy Policy',
      'Data Usage',
      'analytics',
      'Domain',
      'Keyword',
      'URL Pattern',
      'Templates',
      previewContent.output.templateDefaults.articleVideo,
      'YAML Schema',
      'YAML configured',
      'article / clipper / video / ai_chat',
      'Total saved',
      'Reading + Video + Fragment',
      'Usage dashboard',
      'Fragment Clipper',
      'fragment.contextLength',
      'Shortcuts',
      'Reading Session',
      'Reading Overlay Summary',
      'highlight',
      'Video Mode',
      'Timestamp Notes',
      'YouTube / Bilibili'
    );

    const outputView = getSettingsView('output', createSchemaContext());
    const outputViewText = JSON.stringify(outputView);
    expect(outputViewText).not.toContain('Presets');
    expect(outputViewText).not.toContain('Apply Minimal');
    expect(outputViewText).not.toContain('Apply Research');
    expect(outputViewText).not.toContain('Apply Conversation');
  });

  it('maps retired non-REST option domains into production Stitch state', () => {
    const options = mergeOptions({
      aiChat: {
        userName: 'Tester'
      },
      fragmentClipper: {
        ...DEFAULT_OPTIONS.fragmentClipper!,
        contextLength: 360,
        captureContext: true,
        contextMode: 'sentences',
        keyboardShortcutsEnabled: false
      },
      readingSession: {
        ...DEFAULT_OPTIONS.readingSession!,
        exportMode: 'full',
        highlightTheme: 'neonOrange'
      },
      templates: {
        article: 'Articles/{slug}.md',
        fragment: 'Fragments/{slug}.md',
        reading: 'Reading/{slug}.md',
        ai: 'AI/{title}.md'
      },
      video: {
        ...DEFAULT_OPTIONS.video!,
        floatingPromptEnabled: false
      }
    } as Partial<CompleteOptions>) as CompleteOptions;

    const content = createProductionContent(previewContent, options);
    const state = applyOptionsToState(createInitialStitchState(content), options, content);

    expect(state).toEqual(
      expect.objectContaining({
        aiUserName: 'Tester',
        fragmentContextLength: 360,
        fragmentCaptureContext: true,
        fragmentContextMode: 'sentences',
        fragmentKeyboardShortcutsEnabled: false,
        readingExportMode: 'full',
        highlightTheme: 'neonOrange',
        videoFloatingPromptEnabled: false
      })
    );
    expect(state.templateValues).toEqual({
      articleVideo: 'Articles/{slug}.md',
      fragment: 'Fragments/{slug}.md',
      readingCustom: 'Reading/{slug}.md',
      aiChat: 'AI/{title}.md'
    });
  });
});
