/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { getSettingsView } from '@options/stitch/schema/registry';
import { createSchemaTranslator } from '@options/stitch/schema/i18n';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSchemaContext } from '../../utils/productionStitchAssertions';
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
  schemaCaptureSourcesScreenshotLocationTitle: 'Attachment Location Sentinel',
  schemaCaptureSourcesScreenshotFilenameTitle: 'Attachment Filename Sentinel',
  schemaCaptureSourcesMarkdownUrlTitle: 'Markdown URL Sentinel',
  schemaCommonEnabledState: 'Enabled State Sentinel',
  schemaCommonDisabledState: 'Disabled State Sentinel'
};

function resolveDynamicString(
  value: string | ((current: ReturnType<typeof createSchemaContext>) => string),
  current: ReturnType<typeof createSchemaContext>
): string {
  return typeof value === 'function' ? value(current) : value;
}

describe('mountProductionStitchShell capture sources i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders capture sources group, attachment, and state labels from English messages', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    queryRequired<HTMLButtonElement>('[data-nav-panel="capture-sources"]').click();
    await flushPromises();

    const captureSourcesPanel = queryRequired<HTMLElement>('[data-panel-id="capture-sources"]');
    const panelText = captureSourcesPanel.textContent ?? '';

    expect(panelText).toContain('AI Chat Group Sentinel');
    expect(panelText).toContain('Video Group Sentinel');
    expect(panelText).toContain('Attachment Location Sentinel');
    expect(panelText).toContain('Attachment Filename Sentinel');
    expect(panelText).toContain('Markdown URL Sentinel');

    const schemaContext = createSchemaContext();
    schemaContext.state.activePanel = 'capture-sources';
    schemaContext.state.previewLanguage = 'en';
    schemaContext.state.aiUserName = 'USER';
    schemaContext.state.videoFloatingPromptEnabled = true;
    schemaContext.state.videoCommentEditorAutoPause = false;
    schemaContext.messages = ENGLISH_SENTINEL_MESSAGES;
    schemaContext.t = createSchemaTranslator(ENGLISH_SENTINEL_MESSAGES);

    const captureSourcesView = getSettingsView('capture-sources', schemaContext);
    const videoGroup = captureSourcesView?.children?.[1] as
      | {
          children?: Array<{
            body?: Array<{
              items?: Array<{
                control?: {
                  stateText?:
                    | string
                    | ((current: ReturnType<typeof createSchemaContext>) => string);
                };
              }>;
            }>;
          }>;
        }
      | undefined;

    const floatingPromptStateText =
      videoGroup?.children?.[0]?.body?.[0]?.items?.[0]?.control?.stateText;
    const autoPauseStateText = videoGroup?.children?.[0]?.body?.[0]?.items?.[1]?.control?.stateText;

    expect(resolveDynamicString(floatingPromptStateText ?? '', schemaContext)).toBe(
      'Enabled State Sentinel'
    );
    expect(resolveDynamicString(autoPauseStateText ?? '', schemaContext)).toBe(
      'Disabled State Sentinel'
    );
  });
});
