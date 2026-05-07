import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { previewContent } from '@options/stitch/content';
import { STITCH_ACTIONS } from '@options/stitch/runtime/actions';
import { resourceSchemas, settingsSchemas, surfaceSchemas } from '@options/stitch/schema/registry';
import { aiPlatformLinks, themeSegmentedSwitch } from '@options/stitch/schema/builders/settings';
import type { ElementNode, NodeChild, SchemaContext } from '@options/stitch/types';

function resolveChildren(children: unknown, ctx: SchemaContext): NodeChild[] {
  return typeof children === 'function' ? children(ctx) : (children as NodeChild[]);
}

function isElementNode(node: NodeChild): node is ElementNode {
  return Boolean(node && typeof node === 'object' && 'kind' in node && node.kind === 'element');
}

describe('Stitch shared registry contracts', () => {
  it('uses a sidebar brand logo sized close to its rendered footprint', () => {
    expect(previewContent.brand.logo).toBe('../../AiiinOB/public/icons/bannerlogo-128.png');
  });

  it('keeps settings, resources, and runtime surfaces in the accepted order', () => {
    expect(Object.keys(settingsSchemas)).toEqual([
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'experimental',
      'maintenance'
    ]);
    expect(Object.keys(resourceSchemas)).toEqual([
      'onboarding',
      'plugin-setup',
      'support',
      'suggestions',
      'contact',
      'changelog',
      'privacy-policy',
      'data-usage'
    ]);
    expect(Object.keys(surfaceSchemas)).toEqual([
      'clipper',
      'reader',
      'video',
      'video-floating-prompt',
      'task-success'
    ]);
  });

  it('keeps theme selection owned by the Stitch runtime action contract', () => {
    const control = themeSegmentedSwitch();

    expect(control).toMatchObject({
      kind: 'segmentedNav',
      bind: 'previewTheme',
      action: { id: STITCH_ACTIONS.setTheme }
    });
  });

  it('keeps AI platform links visible as chip anchors without disclosure wrappers', () => {
    const ctx: SchemaContext = {
      appData: previewContent,
      state: {
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
        experimentalAiConfig: { ...previewContent.experimental.aiDefaults },
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
        yamlFieldStates: {},
        routingRules: [],
        templateValues: { ...previewContent.output.templateDefaults },
        activeTemplateField: 'articleVideo',
        pendingTemplateFocus: null,
        pendingTemplateSelection: null
      }
    };
    const node = aiPlatformLinks();

    expect(node).toMatchObject({ kind: 'element', tag: 'div' });
    expect(isElementNode(node)).toBe(true);
    if (!isElementNode(node)) {
      throw new Error('Expected AI platform links to render as an element node.');
    }
    expect(node.tag).not.toBe('details');
    expect(node.tag).not.toBe('summary');

    const children = resolveChildren(node.children, ctx);

    expect(children).toHaveLength(previewContent.captureSources.aiPlatforms.length);
    for (const child of children) {
      expect(isElementNode(child)).toBe(true);
      if (!isElementNode(child)) {
        continue;
      }
      expect(child).toMatchObject({
        kind: 'element',
        tag: 'a',
        target: '_blank',
        rel: 'noopener noreferrer',
        ariaPressed: 'true'
      });
      expect(child.tag).not.toBe('details');
      expect(child.tag).not.toBe('summary');
      expect(String(child.className)).toContain('chip');
    }
  });

  it('keeps content runtime surfaces owned by the dedicated surface registry', () => {
    const sourceOfRuntimeSurfaceRenderer = readFileSync(
      resolve(process.cwd(), 'src/content/stitch/runtimeSurfaceRenderer.ts'),
      'utf8'
    );

    expect(sourceOfRuntimeSurfaceRenderer).toContain('@options/stitch/schema/surfaceRegistry');
    expect(sourceOfRuntimeSurfaceRenderer).not.toContain('@options/stitch/schema/registry');
    expect(sourceOfRuntimeSurfaceRenderer).not.toContain('@options/stitch/content');
  });
});
