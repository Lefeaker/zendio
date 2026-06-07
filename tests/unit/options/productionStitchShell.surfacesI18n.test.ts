/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import {
  createProductionStitchAppData,
  createProductionStitchSchemaContext
} from '@options/app/productionStitchShellContext';
import {
  applyOptionsToState,
  createInitialStitchState
} from '@options/app/productionStitchStateMapper';
import { getFooterView } from '@options/stitch/schema/registry';
import { previewContent } from '@options/stitch/content';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
import type { PreviewContent } from '@options/stitch/types';
import { el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asOptionsController,
  createController,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const ENGLISH_SENTINEL_MESSAGES = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaRuntimeClipperTitle: 'Clipper Dialog Sentinel',
  schemaRuntimeClipperDescription: 'Clipper Description Sentinel',
  clipSelection: 'Clip Selection Sentinel',
  addToReaderButton: 'Reader Entry Sentinel',
  clipSelectionVideo: 'Video Entry Sentinel',
  commentPlaceholder: 'Comment Placeholder Sentinel',
  schemaRuntimeSurfaceSaveToLabel: 'Save To Sentinel',
  schemaRuntimeSurfaceConfigureVaultLabel: 'Configure Vault Sentinel',
  schemaRuntimeReaderTitle: 'Reader Mode Sentinel',
  schemaRuntimeReaderDescription: 'Reader Description Sentinel',
  readerPanelTitle: 'Reader Panel Title Sentinel',
  readerPanelStatus: 'Reader Status Sentinel',
  readerPanelCounter: 'Reader Counter Sentinel {count}',
  readerHighlightEditPlaceholder: 'Reader Note Placeholder Sentinel',
  readerHighlightDeleteLabel: 'Reader Delete Sentinel',
  readerPanelFinish: 'Reader Finish Sentinel',
  readerPanelCancel: 'Reader Cancel Sentinel',
  schemaRuntimeVideoTitle: 'Video Mode Sentinel',
  schemaRuntimeVideoDescription: 'Video Description Sentinel',
  videoPanelTitle: 'Video Panel Title Sentinel',
  videoPanelStatus: 'Video Status Sentinel',
  videoPanelCounter: 'Video Counter Sentinel {count}',
  videoCaptureEditPlaceholder: 'Video Note Placeholder Sentinel',
  videoCaptureDeleteLabel: 'Video Delete Sentinel',
  videoPanelAdd: 'Video Add Sentinel',
  videoPanelFinish: 'Video Finish Sentinel',
  videoPanelCancel: 'Video Cancel Sentinel',
  schemaRuntimeVideoCaptureScreenshotLabel: 'Capture Screenshot Sentinel',
  schemaRuntimeVideoRemoveScreenshotLabel: 'Remove Screenshot Sentinel',
  videoPromptAction: 'Video Prompt Action Sentinel',
  videoPromptDismiss: 'Video Prompt Dismiss Sentinel',
  schemaRuntimeTaskSuccessTitle: 'Task Success Sentinel',
  schemaRuntimeTaskSuccessDescription: 'Task Success Description Sentinel',
  schemaRuntimeTaskSuccessProgressAriaLabel: 'Task Progress Aria Sentinel',
  schemaRuntimeTaskSuccessStatusDetail: 'Task Status Detail Sentinel',
  supportPromptTitle: 'Support Prompt Title Sentinel',
  supportPromptKoFiTitle: 'Ko-fi Title Sentinel',
  supportPromptKoFiDescription: 'Ko-fi Description Sentinel',
  supportPromptAfdianTitle: 'Afdian Title Sentinel',
  supportPromptAfdianDescription: 'Afdian Description Sentinel',
  supportPromptLikeLabel: 'Like Label Sentinel',
  supportPromptDislikeLabel: 'Dislike Label Sentinel',
  supportPromptDismiss: 'Task Dismiss Sentinel',
  supportPromptStatusSuccessWithVault: 'Task Status Sentinel {vault}'
};

const SURFACE_INITIAL_OPTIONS = {
  rest: {
    vault: 'Research Vault'
  }
};

type SurfaceId = 'clipper' | 'reader' | 'video' | 'video-floating-prompt' | 'task-success';

function renderRuntimeSurface(
  surfaceId: SurfaceId,
  mutateAppData?: (appData: PreviewContent) => void
): HTMLElement {
  mountProductionStitchShell({
    controller: asOptionsController(createController()),
    initialOptions: SURFACE_INITIAL_OPTIONS,
    messages: ENGLISH_SENTINEL_MESSAGES,
    language: 'en'
  });

  queryRequired<HTMLElement>(`[data-footer-panel="${surfaceId}"]`);

  const draft = mergeOptions(SURFACE_INITIAL_OPTIONS) as CompleteOptions;
  const appData = structuredClone(
    createProductionStitchAppData(draft, {
      maintenanceLog: previewContent.maintenanceLog
    })
  ) as PreviewContent;

  mutateAppData?.(appData);

  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.previewLanguage = 'en';

  const context = createProductionStitchSchemaContext({
    appData,
    language: 'en',
    messages: ENGLISH_SENTINEL_MESSAGES,
    state
  });

  const view = getFooterView(surfaceId, context);
  expect(view).toBeTruthy();

  const rendered = renderPreviewView(view!, {
    ...context,
    el,
    ui: previewUi,
    dispatch: vi.fn()
  } satisfies RendererContext);
  expect(rendered).toBeTruthy();

  document.body.append(rendered!);
  return rendered!;
}

describe('mountProductionStitchShell runtime surface i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders the clipper preview from English schema and runtime messages', () => {
    const clipper = renderRuntimeSurface('clipper', (appData) => {
      const destination = appData.surfaces.clipper.destination;
      if (destination) {
        destination.hasConfiguredVault = false;
        destination.setupUrl = 'https://example.com/vault';
      }
    });

    expect(clipper.querySelector('.resource-modal-headings h2')?.textContent).toBe(
      'Clipper Dialog Sentinel'
    );
    expect(clipper.querySelector('.resource-modal-headings p')?.textContent).toBe(
      'Clipper Description Sentinel'
    );
    expect(
      clipper.querySelector('.clipper-surface-window .surface-window-title')?.textContent
    ).toBe('Clip Selection Sentinel');
    expect(
      queryRequired<HTMLTextAreaElement>('[data-role="clipper-comment-input"]', clipper).placeholder
    ).toBe('Comment Placeholder Sentinel');
    expect(clipper.textContent).toContain('Reader Entry Sentinel');
    expect(clipper.textContent).toContain('Video Entry Sentinel');
    expect(clipper.textContent).toContain('Clip Selection Sentinel');
    expect(clipper.textContent).toContain('Save To Sentinel');
    expect(clipper.textContent).toContain('Configure Vault Sentinel');
    expect(clipper.textContent).not.toContain('用户在网页上选中文本后首先看到的剪藏浮窗');
  });

  it('renders the reader preview from English schema and runtime messages', () => {
    const reader = renderRuntimeSurface('reader');

    expect(reader.querySelector('.resource-modal-headings h2')?.textContent).toBe(
      'Reader Mode Sentinel'
    );
    expect(reader.querySelector('.resource-modal-headings p')?.textContent).toBe(
      'Reader Description Sentinel'
    );
    expect(reader.querySelector('.reader-surface-window .surface-window-title')?.textContent).toBe(
      'Reader Panel Title Sentinel'
    );
    expect(
      reader.querySelector('.reader-surface-window .surface-window-subtitle')?.textContent
    ).toBe('Reader Status Sentinel');
    expect(reader.querySelector('.session-counter')?.textContent?.trim()).toBe(
      'Reader Counter Sentinel 4'
    );
    expect(
      queryRequired<HTMLInputElement>('input[data-highlight-input="reader-1"]', reader).placeholder
    ).toBe('Reader Note Placeholder Sentinel');
    expect(
      queryRequired<HTMLButtonElement>(
        'button[data-action-id="reader:delete"]',
        reader
      ).getAttribute('aria-label')
    ).toBe('Reader Delete Sentinel');
    expect(reader.textContent).toContain('Reader Finish Sentinel');
    expect(reader.textContent).toContain('Reader Cancel Sentinel');
  });

  it('renders the video preview from English schema and runtime messages', () => {
    const video = renderRuntimeSurface('video');

    expect(video.querySelector('.resource-modal-headings h2')?.textContent).toBe(
      'Video Mode Sentinel'
    );
    expect(video.querySelector('.resource-modal-headings p')?.textContent).toBe(
      'Video Description Sentinel'
    );
    expect(video.querySelector('.video-surface-window .surface-window-title')?.textContent).toBe(
      'Video Panel Title Sentinel'
    );
    expect(video.querySelector('.video-surface-window .surface-window-subtitle')?.textContent).toBe(
      'Video Status Sentinel'
    );
    expect(video.querySelector('.session-counter')?.textContent?.trim()).toBe(
      'Video Counter Sentinel 3'
    );
    expect(
      queryRequired<HTMLInputElement>('input[data-capture-input="video-1"]', video).placeholder
    ).toBe('Video Note Placeholder Sentinel');
    expect(
      queryRequired<HTMLButtonElement>('button[data-action-id="video:add"]', video).getAttribute(
        'aria-label'
      )
    ).toBe('Video Add Sentinel');
    expect(
      queryRequired<HTMLButtonElement>('button[data-action-id="video:delete"]', video).getAttribute(
        'aria-label'
      )
    ).toBe('Video Delete Sentinel');
    expect(
      queryRequired<HTMLButtonElement>(
        'button[data-action-id="video:toggle-screenshot"]',
        video
      ).getAttribute('aria-label')
    ).toBe('Capture Screenshot Sentinel');
    expect(video.textContent).toContain('Video Finish Sentinel');
    expect(video.textContent).toContain('Video Cancel Sentinel');
  });

  it('renders the floating video prompt from English runtime messages', () => {
    const prompt = renderRuntimeSurface('video-floating-prompt');

    expect(prompt.querySelector('.video-floating-prompt__hint')?.textContent).toBe(
      'Video Prompt Action Sentinel · Alt+V'
    );
    expect(
      queryRequired<HTMLButtonElement>('.video-floating-prompt__bubble', prompt).getAttribute(
        'aria-label'
      )
    ).toBe('Video Prompt Action Sentinel');
    expect(
      queryRequired<HTMLButtonElement>('.video-floating-prompt__close', prompt).getAttribute(
        'aria-label'
      )
    ).toBe('Video Prompt Dismiss Sentinel');
  });

  it('renders the task success preview from English schema and runtime messages', () => {
    const taskSuccess = renderRuntimeSurface('task-success');

    expect(taskSuccess.querySelector('.resource-modal-headings h2')?.textContent).toBe(
      'Task Success Sentinel'
    );
    expect(taskSuccess.querySelector('.resource-modal-headings p')?.textContent).toBe(
      'Task Success Description Sentinel'
    );
    expect(
      taskSuccess.querySelector('.task-success-header .surface-window-title')?.textContent
    ).toBe('Support Prompt Title Sentinel');
    expect(taskSuccess.querySelector('.task-header-status')?.textContent).toBe(
      'Task Status Sentinel Research Vault'
    );
    expect(
      queryRequired<HTMLElement>('[role="progressbar"]', taskSuccess).getAttribute('aria-label')
    ).toBe('Task Progress Aria Sentinel');
    expect(taskSuccess.querySelector('.task-status-detail')?.textContent).toBe(
      'Task Status Detail Sentinel'
    );
    expect(taskSuccess.textContent).toContain('Ko-fi Title Sentinel');
    expect(taskSuccess.textContent).toContain('Ko-fi Description Sentinel');
    expect(taskSuccess.textContent).toContain('Afdian Title Sentinel');
    expect(taskSuccess.textContent).toContain('Afdian Description Sentinel');
    expect(taskSuccess.textContent).toContain('Like Label Sentinel');
    expect(taskSuccess.textContent).toContain('Dislike Label Sentinel');
    expect(taskSuccess.textContent).toContain('Task Dismiss Sentinel');
    expect(taskSuccess.textContent).not.toContain('整页内容已按当前仓库路由写入');
    expect(taskSuccess.textContent).not.toContain('Articles/Research/2026');
  });
});
