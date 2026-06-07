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
  schemaOverviewTitle: 'Overview Sentinel',
  schemaNavOverviewHint: 'Usage Sentinel',
  schemaResourceSupportTitle: 'Support Sentinel',
  schemaResourceSupportHint: 'Support Hint Sentinel',
  schemaRuntimeClipperTitle: 'Clipper Sentinel',
  schemaRuntimeClipperHint: 'Clipper Hint Sentinel',
  schemaRendererResourceOpenAction: 'Open Sentinel',
  schemaRendererHighlightExamplePrefix: 'Prefix Sentinel ',
  schemaRendererHighlightExampleText: 'Highlight Sentinel',
  schemaRendererHighlightExampleSuffix: ' Suffix Sentinel',
  schemaRuntimeUiGroupTitle: 'Runtime Sentinel'
};

describe('mountProductionStitchShell i18n shell metadata', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders nav, resource, surface, and runtime titles from English messages', () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    const overviewButton = queryRequired<HTMLElement>('[data-nav-panel="overview"]');
    const supportButton = queryRequired<HTMLButtonElement>('[data-footer-panel="support"]');
    const clipperButton = queryRequired<HTMLButtonElement>('[data-footer-panel="clipper"]');

    expect(overviewButton.querySelector('strong')?.textContent).toBe('Overview Sentinel');
    expect(overviewButton.querySelector('.nav-copy span')?.textContent).toBe('Usage Sentinel');
    expect(supportButton.textContent?.trim()).toBe('Support Sentinel');
    expect(supportButton.title).toBe('Support Hint Sentinel');
    expect(clipperButton.textContent?.trim()).toBe('Clipper Sentinel');
    expect(clipperButton.title).toBe('Clipper Hint Sentinel');
    expect(document.querySelector('.sidebar-footer .nav-title')?.textContent).toBe(
      'Runtime Sentinel'
    );
  });

  it('renders schema renderer labels from English messages', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    expect(document.querySelector('.highlight-inline-example')?.textContent).toBe(
      'Prefix Sentinel Highlight Sentinel Suffix Sentinel'
    );

    queryRequired<HTMLButtonElement>('[data-footer-panel="support"]').click();
    await flushPromises();

    expect(
      Array.from(document.querySelectorAll<HTMLElement>('.resource-link-action')).some(
        (action) => action.textContent?.trim() === 'Open Sentinel'
      )
    ).toBe(true);
  });

  it('uses message-backed runtime group titles even when the current language is not English', () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'zh-CN'
    });

    expect(document.querySelector('.sidebar-footer .nav-title')?.textContent).toBe(
      'Runtime Sentinel'
    );
  });
});
