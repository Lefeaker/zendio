/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  asOptionsController,
  createController,
  flushPromises,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const ENGLISH_SENTINEL_MESSAGES = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaCaptureSourcesAiChatGroupTitle: 'AI Chat Group Sentinel',
  schemaCaptureSourcesVideoGroupTitle: 'Video Group Sentinel',
  schemaCaptureSourcesVideoEntryBehaviorTitle: 'Video Entry Behavior Sentinel',
  schemaCaptureSourcesVideoEntryBehaviorDescription: 'Video Entry Behavior Description Sentinel',
  schemaCaptureSourcesVideoNoteButtonLabel: 'Video Note Button Sentinel',
  schemaCaptureSourcesVideoPromptHelper: 'Video Prompt Helper Sentinel',
  schemaCaptureSourcesAttachmentPathGroupTitle: 'Attachment Path Group Sentinel',
  schemaCaptureSourcesScreenshotLocationTitle: 'Attachment Location Sentinel',
  schemaCaptureSourcesScreenshotFilenameTitle: 'Attachment Filename Sentinel',
  schemaCaptureSourcesMarkdownUrlTitle: 'Markdown URL Sentinel',
  schemaCaptureSourcesAttachmentGuidancePrefix: 'Attachment Guidance Prefix Sentinel ',
  schemaCaptureSourcesAttachmentGuidanceLink: 'Attachment Guidance Link Sentinel',
  schemaCaptureSourcesAttachmentGuidanceSuffix: ' Attachment Guidance Suffix Sentinel',
  schemaCommonEnabledState: 'Enabled State Sentinel',
  schemaCommonDisabledState: 'Disabled State Sentinel'
};

describe('mountProductionStitchShell capture sources i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders capture sources group, video entry, and attachment labels from English messages', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: {
        video: {
          floatingPromptEnabled: true,
          commentEditorAutoPause: false
        }
      },
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    const captureSourcesNav = queryRequired<HTMLButtonElement>(
      '[data-nav-panel="capture-sources"]'
    );
    expect(captureSourcesNav.textContent ?? '').not.toContain('Deep Research');
    captureSourcesNav.click();
    await flushPromises();

    const captureSourcesPanel = queryRequired<HTMLElement>('[data-panel-id="capture-sources"]');
    const panelText = captureSourcesPanel.textContent ?? '';

    expect(panelText).toContain('AI Chat Group Sentinel');
    expect(panelText).toContain('Video Group Sentinel');
    expect(panelText).toContain('Video Entry Behavior Sentinel');
    expect(panelText).toContain('Video Entry Behavior Description Sentinel');
    expect(panelText).toContain('Video Note Button Sentinel');
    expect(panelText).toContain('Video Prompt Helper Sentinel');
    expect(panelText).toContain('Attachment Path Group Sentinel');
    expect(panelText).toContain('Attachment Location Sentinel');
    expect(panelText).toContain('Attachment Filename Sentinel');
    expect(panelText).toContain('Markdown URL Sentinel');
    expect(panelText).toContain('Attachment Guidance Prefix Sentinel');
    expect(panelText).toContain('Attachment Guidance Link Sentinel');
    expect(panelText).toContain('Attachment Guidance Suffix Sentinel');
    const videoEntryRow = captureSourcesPanel.querySelector<HTMLElement>('.video-entry-toggle-row');
    expect(
      videoEntryRow?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    ).toHaveLength(2);

    const attachmentLink = captureSourcesPanel.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/mnaoumov/obsidian-custom-attachment-location"]'
    );
    expect(attachmentLink?.textContent).toBe('Attachment Guidance Link Sentinel');
  });
});
