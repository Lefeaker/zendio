/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { VideoSection } from '@options/components/sections/VideoSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import en from '@i18n/locales/en';
import { MockOptionsRepository } from '../../../utils/repositories';

const videoMocks = vi.hoisted(() => {
  const scheduleAutoSave = vi.fn();
  return { scheduleAutoSave };
}) as {
  scheduleAutoSave: ReturnType<typeof vi.fn>;
};

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({
    scheduleAutoSave: videoMocks.scheduleAutoSave
  }),
  markPendingAutoSave: vi.fn()
}));

const noopStateManager = {} as OptionsStateManager;

describe('VideoSection', () => {
  let registry: FormSectionRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<section id="video-section"></section>';
    registry = new FormSectionRegistry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = (): { section: VideoSection; repo: MockOptionsRepository } => {
    const container = document.getElementById('video-section');
    if (!container) {
      throw new Error('Video container missing');
    }
    const repo = new MockOptionsRepository();
    const section = new VideoSection(container, repo);
    section.setMessages(en.runtime);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return { section, repo };
  };

  it('fires auto save when floating prompt toggles', () => {
    const { section } = renderSection();
    const toggle = document.getElementById('videoFloatingPrompt') as HTMLInputElement;
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    expect(toggle.checked).toBe(true);

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(videoMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);
    section.destroy();
  });

  it('applies snapshot and collects video configuration', async () => {
    const { section, repo } = renderSection();
    const snapshot = {
      video: {
        floatingPromptEnabled: true,
        promptButtonLabel: '开启视频笔记',
        promptShortcut: 'CTRL+V'
      }
    } as StoredOptions;

    await registry.apply(snapshot);

    const toggle = document.getElementById('videoFloatingPrompt') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    const labelInput = document.getElementById('videoPromptLabel') as HTMLInputElement;
    expect(labelInput.value).toBe('开启视频笔记');
    labelInput.value = '快速开启视频模式';
    labelInput.dispatchEvent(new Event('input', { bubbles: true }));

    const shortcutInput = document.getElementById('videoPromptShortcut') as HTMLInputElement;
    expect(shortcutInput.value).toBe('CTRL+V');
    shortcutInput.value = 'shift+v';
    shortcutInput.dispatchEvent(new Event('input', { bubbles: true }));

    const collected = registry.collect(snapshot);
    expect(collected.video).toEqual({
      floatingPromptEnabled: false,
      promptButtonLabel: '快速开启视频模式',
      promptShortcut: 'SHIFT+V'
    });

    expect(repo.getMockData().video).toEqual(collected.video);
    section.destroy();
  });

  it('updates UI when repository snapshot changes', async () => {
    const { section, repo } = renderSection();
    await repo.set({
      video: {
        floatingPromptEnabled: true,
        promptButtonLabel: '开启视频模式',
        promptShortcut: 'ALT+P'
      }
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      const toggle = document.getElementById('videoFloatingPrompt') as HTMLInputElement;
      expect(toggle.checked).toBe(true);
      const shortcutInput = document.getElementById('videoPromptShortcut') as HTMLInputElement;
      expect(shortcutInput.value).toBe('ALT+P');
    });

    section.destroy();
  });

  it('renders localized prompt copy and supported platform text', () => {
    renderSection();

    expect(document.body.textContent).toContain(en.runtime.videoPromptCustomizationTitle);
    expect(document.body.textContent).toContain(en.runtime.videoPromptLabelTitle);
    expect(document.body.textContent).toContain(en.runtime.videoPromptShortcutTitle);
    expect(document.body.textContent).toContain(en.runtime.videoSupportedPlatformsTitle);
    expect(document.body.textContent).toContain(en.runtime.videoEnableButton);
    expect(document.body.textContent).toContain(en.runtime.videoSaveConfigButton);
    expect(document.body.textContent).toContain(en.runtime.videoPlatformYoutubeDescription);
    expect(document.body.textContent).toContain(en.runtime.videoPlatformBilibiliDescription);
  });
});
