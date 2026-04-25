import { expect, test } from '@playwright/test';
import {
  PRODUCTION_ONBOARDING_FOOTER_LABELS,
  PRODUCTION_OPTIONS_MODAL_RESOURCE_LABELS,
  PRODUCTION_OPTIONS_NAV_LABELS,
  PRODUCTION_OPTIONS_RESOURCE_LABELS,
  PRODUCTION_OPTIONS_STABLE_STATES,
  STITCH_SECONDARY_ACCEPTANCE_INVENTORY,
  renderProductionOnboardingShell,
  renderProductionOptionsShell
} from './utils/renderProductionOptionsShell';

test.describe('production stitch secondary shell', () => {
  test('keeps the protected acceptance inventory wired to current production surfaces', async ({
    page
  }) => {
    expect(STITCH_SECONDARY_ACCEPTANCE_INVENTORY).toEqual([
      {
        area: 'options shell',
        previewTargets: ['settings shell chrome', 'settings information architecture'],
        productionSurface: {
          page: 'options/index.html',
          navLabels: [...PRODUCTION_OPTIONS_NAV_LABELS],
          resourceLabels: [...PRODUCTION_OPTIONS_RESOURCE_LABELS]
        }
      },
      {
        area: 'onboarding',
        previewTargets: ['首次引导'],
        productionSurface: {
          page: 'onboarding/index.html',
          footerLabels: [...PRODUCTION_ONBOARDING_FOOTER_LABELS]
        }
      },
      {
        area: 'support/suggestions/contact/changelog/plugin-setup',
        previewTargets: ['插件设置', '支持', '建议', '联系', '更新日志'],
        productionSurface: {
          modalResourceLabels: [...PRODUCTION_OPTIONS_MODAL_RESOURCE_LABELS]
        }
      },
      {
        area: 'clipper',
        previewTargets: ['剪藏弹窗'],
        productionSurface: {
          protectedBy: 'preview.runtime.alignment.spec.ts'
        }
      },
      {
        area: 'reader',
        previewTargets: ['阅读模式'],
        productionSurface: {
          protectedBy: 'preview.runtime.alignment.spec.ts'
        }
      },
      {
        area: 'video',
        previewTargets: ['视频模式'],
        productionSurface: {
          protectedBy: 'preview.runtime.alignment.spec.ts'
        }
      },
      {
        area: 'task success',
        previewTargets: ['任务完成'],
        productionSurface: {
          protectedBy: 'preview.task-success.layout.spec.ts'
        }
      }
    ]);

    const shellContract = await renderProductionOptionsShell(page);
    expect(shellContract.navLabels).toEqual([...PRODUCTION_OPTIONS_NAV_LABELS]);
    expect(shellContract.resourceLabels).toEqual([...PRODUCTION_OPTIONS_RESOURCE_LABELS]);
    expect(shellContract.sidebarGroupTitles).toEqual(['Settings', 'Resources']);
    expect(shellContract.activeNavLabel).toBe('Overview');
    expect(shellContract.visibleModalTitles).toEqual([]);
    await expect(page.locator('.schema-panel-section')).toHaveCount(
      PRODUCTION_OPTIONS_NAV_LABELS.length
    );
    await expect(page.locator('.schema-shell-sidebar-footer')).toContainText('Onboarding');

    const onboardingContract = await renderProductionOnboardingShell(page);
    expect(onboardingContract.headings).toContain('Welcome to All in Ob');
    expect(onboardingContract.footerLinkTexts).toEqual([...PRODUCTION_ONBOARDING_FOOTER_LABELS]);
    await expect(page.locator('.schema-onboarding-step')).toHaveCount(5);
  });

  test('opens onboarding from the schema shell as a standalone page route', async ({ page }) => {
    await page.addInitScript(() => {
      const openCalls: string[][] = [];
      Object.defineProperty(window, '__aobWindowOpenCalls', {
        value: openCalls,
        configurable: true
      });
      window.open = (...args) => {
        openCalls.push(args.map((arg) => String(arg)));
        return null;
      };
    });

    const shellContract = await renderProductionOptionsShell(page, 'default');
    expect(shellContract.resourceLabels).toContain('Onboarding');

    await page.locator('.schema-shell-resource-link').filter({ hasText: 'Onboarding' }).click();

    const openCalls = await page.evaluate(() => {
      return (
        (window as typeof window & { __aobWindowOpenCalls?: string[][] }).__aobWindowOpenCalls ?? []
      );
    });
    expect(openCalls).toContainEqual(['../onboarding/index.html', '_blank', 'noopener,noreferrer']);
  });

  test('owns theme control inside Overview -> Interface and preserves live theme switching', async ({
    page
  }) => {
    await renderProductionOptionsShell(page, 'default');

    await expect(page.locator('#theme-switcher')).toHaveCount(0);
    await expect(page.locator('.schema-settings-theme-segmented')).toContainText('Interface Theme');
    await expect(page.locator('.schema-settings-theme-option')).toHaveCount(2);

    await page.locator('.schema-settings-theme-option', { hasText: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(
      page.locator('.schema-settings-theme-option.is-active', { hasText: 'Light' })
    ).toHaveCount(1);
  });

  for (const state of PRODUCTION_OPTIONS_STABLE_STATES) {
    test(`captures the full shell in a stable ${state.label} state`, async ({ page }, testInfo) => {
      const shellContract = await renderProductionOptionsShell(page, state.id);
      expect(shellContract.navLabels).toEqual([...PRODUCTION_OPTIONS_NAV_LABELS]);
      expect(shellContract.resourceLabels).toEqual([...PRODUCTION_OPTIONS_RESOURCE_LABELS]);

      if (state.id === 'default') {
        expect(shellContract.visibleModalTitles).toEqual([]);
      } else {
        expect(shellContract.visibleModalTitles).toEqual([state.resourceLabel]);
      }

      test.skip(
        (state.id === 'changelog' || state.id === 'contact') &&
          testInfo.project.name === 'chromium-mobile',
        `${state.resourceLabel ?? state.id} remains visually unstable on chromium-mobile; reachability is covered separately.`
      );

      await expect(page.locator('.schema-shell-app')).toHaveScreenshot(
        `options-stitch-secondary-shell-${state.id}.png`,
        { maxDiffPixels: 2000 }
      );
    });
  }

  test('opens changelog through the production schema resource rail', async ({ page }) => {
    const shellContract = await renderProductionOptionsShell(page, 'default');
    expect(shellContract.resourceLabels).toContain('Changelog');

    await page.locator('.schema-shell-resource-link').filter({ hasText: 'Changelog' }).click();
    await expect(page.locator('.schema-modal-copy h3')).toHaveText('Changelog');
    await expect(page.locator('.schema-changelog-html')).toBeVisible();
  });

  test('opens contact through the production schema resource rail', async ({ page }) => {
    const shellContract = await renderProductionOptionsShell(page, 'default');
    expect(shellContract.resourceLabels).toContain('Contact');

    await page.locator('.schema-shell-resource-link').filter({ hasText: 'Contact' }).click();
    await expect(page.locator('.schema-modal-copy h3')).toHaveText('Contact');
  });

  test('captures the standalone onboarding page in stitch secondary layout', async ({ page }) => {
    const onboardingContract = await renderProductionOnboardingShell(page);
    expect(onboardingContract.footerLinkTexts).toEqual([...PRODUCTION_ONBOARDING_FOOTER_LABELS]);

    await expect(page.locator('body')).toHaveScreenshot('options-stitch-secondary-onboarding.png', {
      maxDiffPixels: 2000
    });
  });
});
