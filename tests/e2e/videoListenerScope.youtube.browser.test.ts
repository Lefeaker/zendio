import { expect } from '@playwright/test';
import {
  createOptionsFixture,
  dispatchSyntheticVideoPlay,
  expandVideoPanel,
  expectHorizontallyCenteredUnlessClamped,
  expectPxWithin,
  installPlaybackFixture,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  readControlBarGeometry,
  readHostShortcutCounters,
  readPlaybackCounters,
  selectFixtureText,
  submitControlBarNote,
  testWithExtension,
  YOUTUBE_PAUSED_URL,
  YOUTUBE_URL,
  youtubeFixtureHtml
} from './utils/videoListenerScopeHarness';

export function registerVideoListenerScopeYouTubeTests(): void {
  testWithExtension(
    'keeps YouTube control-bar geometry and popover clamp parity in Chromium',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      await expect(page.locator('[data-aiob-video-control-bar-button="true"]')).toHaveCount(1);
      const beforeOpen = await readControlBarGeometry(page, '.ytp-right-controls');
      expect(beforeOpen.button?.parentMatchesTarget).toBe(true);
      expect(beforeOpen.button?.isFirstElementChild).toBe(true);
      expect(beforeOpen.icon).not.toBeNull();
      expectPxWithin(beforeOpen.button?.computed.width ?? null, 31);
      expectPxWithin(beforeOpen.button?.computed.height ?? null, 31);
      expectPxWithin(beforeOpen.button?.computed.marginLeft ?? null, 8);
      expectPxWithin(beforeOpen.button?.computed.marginRight ?? null, 8);

      await page.locator('[data-aiob-video-control-bar-button="true"]').click();
      const afterOpen = await readControlBarGeometry(page, '.ytp-right-controls');
      expect(afterOpen.popover).not.toBeNull();
      expectPxWithin(afterOpen.popover?.computed.width ?? null, 220);
      expect(afterOpen.popover?.inlineLeft).not.toBeNull();
      expect(afterOpen.popover?.inlineTop).not.toBeNull();
      expect(afterOpen.popover?.horizontalClamp.withinRange).toBe(true);
      expect(afterOpen.popover?.verticalClamp.withinRange).toBe(true);
      if (afterOpen.popover?.horizontalClamp.clamped) {
        const left = afterOpen.popover.inlineLeft ?? Number.NaN;
        const rightClamp = afterOpen.popover.horizontalClamp.max;
        expect(
          Math.abs(left - afterOpen.popover.horizontalClamp.min) <= 1 ||
            Math.abs(left - rightClamp) <= 1
        ).toBe(true);
      } else {
        expectHorizontallyCenteredUnlessClamped(afterOpen.popover?.horizontalCenterDelta ?? null);
      }
      expect(afterOpen.popover?.noteInputIsActive).toBe(true);
      expect(afterOpen.popover?.noteInputIsFirstFocusable).toBe(true);
      expect(afterOpen.popover?.focusableOrder).toEqual([
        'note-input',
        'toggle:autoPauseEnabled',
        'toggle:captureScreenshotEnabled'
      ]);
      expect(afterOpen.popover?.toggleOrder).toEqual([
        'autoPauseEnabled',
        'captureScreenshotEnabled'
      ]);
    }
  );

  testWithExtension(
    'opens real Video Mode from a YouTube-like control-bar note',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      const logo = page.locator('[data-aiob-video-control-bar-button="true"]');
      await expect(logo).toHaveCount(1);
      await openVideoPanelFromControlBar(page, 'Browser control-bar note');
      await expect(logo).toHaveCount(1);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
    }
  );

  testWithExtension(
    'keeps panel note input keys isolated from YouTube-like host shortcuts',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );

      await openVideoPanelFromControlBar(page, '');
      await expandVideoPanel(page);
      const before = await readHostShortcutCounters(page);

      const addButton = page.locator('.session-add-capture-card [data-role="add-btn"]');
      const addNoteInput = page.locator(
        '.session-add-capture-card [data-action-id="video:add-note"]'
      );
      const addButtonBox = await addButton.boundingBox();
      const addNoteInputBox = await addNoteInput.boundingBox();
      expect(addButtonBox).not.toBeNull();
      expect(addNoteInputBox).not.toBeNull();
      expect(
        Math.abs(
          (addButtonBox?.y ?? Number.NaN) +
            (addButtonBox?.height ?? Number.NaN) / 2 -
            ((addNoteInputBox?.y ?? Number.NaN) + (addNoteInputBox?.height ?? Number.NaN) / 2)
        )
      ).toBeLessThanOrEqual(1.5);

      await page.locator('[data-action-id="video:add-note"]').click();
      const input = page.locator('[data-capture-input]').last();
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
      await page.keyboard.type('lm test');

      const after = await readHostShortcutCounters(page);
      expect(after.l).toBe(before.l);
      expect(after.m).toBe(before.m);
      expect(after.space).toBe(before.space);
      await expect(input).toHaveValue('lm test');
    }
  );

  testWithExtension(
    'keeps playback paused while the control-bar note input is active and restores only playing videos',
    async ({ context, extensionPage }) => {
      const { page: playingPage, tabId: playingTabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml()
      );
      await installPlaybackFixture(extensionPage, playingTabId, false);

      await playingPage.locator('[data-aiob-video-control-bar-button="true"]').click();
      const playingInput = playingPage.locator('[data-aiob-video-control-bar-note-input="true"]');
      await expect(playingInput).toBeFocused();
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.pause)
        )
        .toBe(1);

      await dispatchSyntheticVideoPlay(extensionPage, playingTabId);
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.pause)
        )
        .toBe(2);

      await playingInput.fill('Playing note');
      await playingInput.press('Enter');
      await expect
        .poll(() =>
          readPlaybackCounters(extensionPage, playingTabId).then((counters) => counters.play)
        )
        .toBe(1);

      const { page: pausedPage, tabId: pausedTabId } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_PAUSED_URL,
        youtubeFixtureHtml()
      );
      await installPlaybackFixture(extensionPage, pausedTabId, true);
      await submitControlBarNote(pausedPage, 'Paused note');
      const pausedCounters = await readPlaybackCounters(extensionPage, pausedTabId);
      expect(pausedCounters.pause).toBe(0);
      expect(pausedCounters.play).toBe(0);
    }
  );

  testWithExtension(
    'keeps selection capture modifier-gated through the real session',
    async ({ context, extensionPage }) => {
      const { page } = await openFixtureWithRuntime(
        context,
        extensionPage,
        YOUTUBE_URL,
        youtubeFixtureHtml(),
        createOptionsFixture({
          selectionModifierEnabled: true,
          selectionModifierKeys: ['shift']
        })
      );

      await openVideoPanelFromControlBar(page, 'Seed modifier capture');
      await expandVideoPanel(page);
      const initialCount = await page.locator('[data-role="capture-item"]').count();

      await selectFixtureText(page);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      });
      await page.waitForTimeout(100);
      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount);

      await page.keyboard.down('Shift');
      await selectFixtureText(page);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        document.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true })
        );
      });
      await page.keyboard.up('Shift');

      await expect(page.locator('[data-role="capture-item"]')).toHaveCount(initialCount + 1);
      await expect(page.locator('[data-role="capture-item"]').last()).toContainText(
        'Browser selected fragment text'
      );
    }
  );
}
