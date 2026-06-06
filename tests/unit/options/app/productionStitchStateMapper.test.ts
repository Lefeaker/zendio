import { describe, expect, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import { previewContent } from '@options/stitch/content';
import { testPlatformHarness } from '../../../setup/globalSetup';
import { createChromeRuntimeMock } from '../../../utils/browserMocks';
import {
  applyOptionsToState,
  createInitialStitchState,
  createProductionContent,
  resolveExtensionVersionLabel,
  resolveReadingPathMode,
  toRoutingRules,
  toTemplateValues
} from '@options/app/productionStitchStateMapper';
import { applyTemplateStateToDraft } from '@options/app/productionStitchShellState';
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

  it('applies reading template mode through the production Stitch state owner', () => {
    const draft = options({
      templates: {
        article: 'Articles/{slug}.md',
        fragment: 'Fragments/{slug}.md',
        reading: 'Reading/{slug}.md',
        ai: 'AI/{title}.md'
      }
    } as Partial<CompleteOptions>);
    const state = createInitialStitchState(previewContent);
    state.templateValues = {
      ...state.templateValues,
      articleVideo: 'Articles/current.md',
      fragment: 'Fragments/current.md',
      readingCustom: 'Reading/custom.md'
    };

    state.readingPathMode = 'article';
    applyTemplateStateToDraft(draft, state);
    expect(draft.templates.reading).toBe('Articles/current.md');

    state.readingPathMode = 'fragment';
    applyTemplateStateToDraft(draft, state);
    expect(draft.templates.reading).toBe('Fragments/current.md');

    state.readingPathMode = 'custom';
    applyTemplateStateToDraft(draft, state);
    expect(draft.templates.reading).toBe('Reading/custom.md');
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

    expect(content.brand.title).toBe('Zendio');
    expect(content.surfaceLinks).toEqual([]);
    expect(state.aiUserName).toBe('Tester');
    expect(state.templateValues.articleVideo).toBe(draft.templates.article);
  });

  it('maps video screenshot attachment state and keeps merged defaults for partial stored options', () => {
    const draft = options({
      video: {
        screenshotAttachment: {
          locationTemplate: 'VideoShots/${noteFileName}',
          markdownUrlFormat: '![[${fileName}]]'
        }
      }
    } as Partial<CompleteOptions>);
    const content = createProductionContent(previewContent, draft);
    const initialState = createInitialStitchState(content);
    const state = applyOptionsToState(initialState, draft, content);

    expect(initialState.videoScreenshotAttachmentLocationTemplate).toBe('./assets/${noteFileName}');
    expect(initialState.videoScreenshotAttachmentFileNameTemplate).toBe(
      "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg"
    );
    expect(initialState.videoScreenshotAttachmentMarkdownUrlFormat).toBe('');
    expect(state.videoScreenshotAttachmentLocationTemplate).toBe('VideoShots/${noteFileName}');
    expect(state.videoScreenshotAttachmentFileNameTemplate).toBe(
      "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg"
    );
    expect(state.videoScreenshotAttachmentMarkdownUrlFormat).toBe('![[${fileName}]]');
  });

  it('resolves extension version from platform runtime instead of direct chrome globals', () => {
    testPlatformHarness.runtime.getManifest = () => ({ version: '9.8.7' });
    testPlatformHarness.configure();

    const chromeMock = createChromeRuntimeMock();
    chromeMock.runtimeMocks.getManifest.mockReturnValue({
      manifest_version: 3,
      name: 'direct-extension',
      version: '0.0.0-direct'
    });

    try {
      expect(resolveExtensionVersionLabel()).toBe('v9.8.7');
    } finally {
      chromeMock.restore();
      delete testPlatformHarness.runtime.getManifest;
    }
  });
});
