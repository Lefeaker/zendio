import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

const PLAYWRIGHT_VISUAL_HOST = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? '127.0.0.1';
const PLAYWRIGHT_VISUAL_PORT = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181');
const PLAYWRIGHT_VISUAL_BASE_URL = `http://${PLAYWRIGHT_VISUAL_HOST}:${PLAYWRIGHT_VISUAL_PORT}`;

function resolveWorkspaceFile(relativePath: string): string {
  for (let current = process.cwd(); current; ) {
    const candidate = path.join(current, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  throw new Error(`Unable to resolve workspace file: ${relativePath}`);
}

function latestModifiedAt(targetPath: string): number {
  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  return fs.readdirSync(targetPath, { withFileTypes: true }).reduce((latest, entry) => {
    const entryPath = path.join(targetPath, entry.name);
    return Math.max(latest, latestModifiedAt(entryPath));
  }, stats.mtimeMs);
}

const PREVIEW_SOURCE_ROOT = resolveWorkspaceFile(path.join('src', 'options', 'preview'));
const PREVIEW_BUILD_SCRIPT = resolveWorkspaceFile(path.join('scripts', 'build-preview.mjs'));
const PREVIEW_OUTPUT_INDEX = resolveWorkspaceFile(
  path.join('future', 'options-component-preview', 'options-preview-stitch-secondary.html')
);

const previewSourceModifiedAt = Math.max(
  latestModifiedAt(PREVIEW_SOURCE_ROOT),
  latestModifiedAt(PREVIEW_BUILD_SCRIPT)
);
const previewOutputModifiedAt = latestModifiedAt(PREVIEW_OUTPUT_INDEX);

if (previewSourceModifiedAt > previewOutputModifiedAt) {
  throw new Error(
    'Preview artifacts are stale. Run `npm run preview:build` before visual parity tests.'
  );
}

export const PREVIEW_STITCH_SECONDARY_INDEX_URL = pathToFileURL(PREVIEW_OUTPUT_INDEX).toString();

export const PRODUCTION_OPTIONS_PAGE_URL = new URL(
  '/options/index.html',
  PLAYWRIGHT_VISUAL_BASE_URL
).toString();
export const PRODUCTION_ONBOARDING_PAGE_URL = new URL(
  '/onboarding/index.html',
  PLAYWRIGHT_VISUAL_BASE_URL
).toString();

export const PREVIEW_STITCH_SECONDARY_FOOTER_LABELS = [
  '首次引导',
  '插件设置',
  '支持',
  '建议',
  '联系',
  '更新日志',
  '剪藏弹窗',
  '阅读模式',
  '视频模式',
  '任务完成'
] as const;

export const PRODUCTION_OPTIONS_NAV_LABELS = [
  'Overview',
  'Storage',
  'Capture Sources',
  'Capture Behavior',
  'Output & Metadata',
  'Experimental',
  'Maintenance'
] as const;

export const PRODUCTION_OPTIONS_RESOURCE_LABELS = [
  'Onboarding',
  'Plugin Setup',
  'Support',
  'Suggestions',
  'Contact',
  'Changelog'
] as const;

export const PRODUCTION_OPTIONS_MODAL_RESOURCE_LABELS = [
  'Plugin Setup',
  'Support',
  'Suggestions',
  'Contact',
  'Changelog'
] as const;

export const PRODUCTION_ONBOARDING_FOOTER_LABELS = [
  'Suggestions',
  'Support',
  'Contact Author'
] as const;

export const STITCH_SECONDARY_ACCEPTANCE_INVENTORY = [
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
] as const;

export const PRODUCTION_OPTIONS_STABLE_STATES = [
  { id: 'default', label: 'default shell' },
  { id: 'plugin-setup', label: 'plugin setup modal', resourceLabel: 'Plugin Setup' },
  { id: 'support', label: 'support modal', resourceLabel: 'Support' },
  { id: 'suggestions', label: 'suggestions modal', resourceLabel: 'Suggestions' },
  { id: 'contact', label: 'contact modal', resourceLabel: 'Contact' },
  { id: 'changelog', label: 'changelog modal', resourceLabel: 'Changelog' }
] as const;

export type ProductionOptionsStableState = (typeof PRODUCTION_OPTIONS_STABLE_STATES)[number]['id'];

export interface ProductionOptionsShellContract {
  navLabels: string[];
  resourceLabels: string[];
  sidebarGroupTitles: string[];
  activeNavLabel: string | null;
  visibleModalTitles: string[];
}

export interface ProductionOnboardingContract {
  title: string;
  headings: string[];
  footerLinkTexts: string[];
}

async function installStabilityStyles(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `
  });
}

async function waitForOptionsShell(page: Page): Promise<void> {
  await page.waitForSelector('#optionsShellRoot .schema-shell-app');
  await page.waitForSelector('.schema-shell-sidebar');
  await page.waitForSelector('.schema-shell-main');
  await page.waitForTimeout(250);
  await installStabilityStyles(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function openResourceByLabel(page: Page, resourceLabel: string): Promise<void> {
  const trigger = page.locator('.schema-shell-resource-link').filter({ hasText: resourceLabel });

  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.waitForSelector('.schema-modal-overlay');
  await page.waitForTimeout(150);
}

export async function collectProductionOptionsShellContract(
  page: Page
): Promise<ProductionOptionsShellContract> {
  return page.evaluate(() => {
    const navButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.schema-shell-nav button')
    );
    const resourceButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.schema-shell-resource-link')
    );
    const modalTitles = Array.from(
      document.querySelectorAll<HTMLElement>('.schema-modal-overlay .schema-modal-copy h3')
    );

    return {
      navLabels: navButtons
        .map((button) => button.querySelector('strong')?.textContent?.trim() ?? '')
        .filter(Boolean),
      resourceLabels: resourceButtons
        .map((button) => button.textContent?.trim() ?? '')
        .filter(Boolean),
      sidebarGroupTitles: Array.from(
        document.querySelectorAll<HTMLElement>('.schema-shell-nav-title')
      )
        .map((node) => node.textContent?.trim() ?? '')
        .filter(Boolean),
      activeNavLabel:
        navButtons
          .find((button) => button.classList.contains('is-active'))
          ?.querySelector('strong')
          ?.textContent?.trim() ?? null,
      visibleModalTitles: modalTitles.map((node) => node.textContent?.trim() ?? '').filter(Boolean)
    };
  });
}

export async function collectProductionOnboardingContract(
  page: Page
): Promise<ProductionOnboardingContract> {
  return page.evaluate(() => ({
    title: document.title,
    headings: Array.from(document.querySelectorAll('h1, h2, h3'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean),
    footerLinkTexts: Array.from(document.querySelectorAll<HTMLElement>('.footer-links a'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean)
  }));
}

export async function renderProductionOptionsShell(
  page: Page,
  state: ProductionOptionsStableState = 'default'
): Promise<ProductionOptionsShellContract> {
  await page.goto(PRODUCTION_OPTIONS_PAGE_URL, { waitUntil: 'networkidle' });
  await waitForOptionsShell(page);

  const stableState = PRODUCTION_OPTIONS_STABLE_STATES.find((entry) => entry.id === state);
  if (!stableState) {
    throw new Error(`Unsupported options shell state: ${state}`);
  }

  if (stableState.id !== 'default') {
    await openResourceByLabel(page, stableState.resourceLabel);
  }

  await page.waitForTimeout(150);
  return collectProductionOptionsShellContract(page);
}

export async function renderProductionOnboardingShell(
  page: Page
): Promise<ProductionOnboardingContract> {
  await page.goto(PRODUCTION_ONBOARDING_PAGE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await installStabilityStyles(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  return collectProductionOnboardingContract(page);
}
