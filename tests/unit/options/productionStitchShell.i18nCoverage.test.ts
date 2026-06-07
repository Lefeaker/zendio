/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { previewContent } from '@options/stitch/content';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
import { getFooterView, getResourceView } from '@options/stitch/schema/registry';
import { previewUi } from '@options/stitch/ui/components';
import { el } from '@options/stitch/ui/dom';
import { createSchemaContext as createBaseSchemaContext } from '../../utils/productionStitchAssertions';
import { expectNoChineseSettingsCopy } from '../../utils/optionsI18nTextAssertions';
import {
  asOptionsController,
  createCompleteOptions,
  createController,
  findButton,
  flushPromises,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const SETTINGS_PANEL_IDS = [
  'overview',
  'storage',
  'capture-sources',
  'capture-behavior',
  'output',
  'maintenance'
];

const RESOURCE_MODAL_IDS = ['plugin-setup', 'support', 'suggestions', 'contact', 'changelog'];

type RuntimeSurfaceId = 'clipper' | 'reader' | 'video' | 'video-floating-prompt' | 'task-success';

const RUNTIME_SURFACE_IDS: RuntimeSurfaceId[] = [
  'clipper',
  'reader',
  'video',
  'video-floating-prompt',
  'task-success'
];

const SURFACE_INITIAL_OPTIONS = {
  rest: {
    vault: 'Research Vault'
  }
};

const RESOURCE_LINKS: Array<{ label: string; resourceId: string }> = [
  { label: DEFAULT_RUNTIME_MESSAGES.privacyPolicyLink, resourceId: 'privacy-policy' },
  { label: DEFAULT_RUNTIME_MESSAGES.dataUsageLink, resourceId: 'data-usage' }
];

function renderRequiredElement(
  rendered: ReturnType<typeof renderPreviewView>,
  description: string
): HTMLElement {
  if (!(rendered instanceof HTMLElement)) {
    throw new Error(`Missing rendered ${description}.`);
  }
  return rendered;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createEnglishSchemaContext() {
  const base = createBaseSchemaContext();
  return createProductionStitchSchemaContext({
    appData: base.appData,
    state: {
      ...base.state,
      previewLanguage: 'en'
    },
    language: 'en',
    messages: DEFAULT_RUNTIME_MESSAGES
  });
}

function renderOnboardingPage(): HTMLElement {
  const context = createEnglishSchemaContext();
  const view = getResourceView('onboarding', context);
  if (!view) {
    throw new Error('Missing onboarding preview view.');
  }

  return renderRequiredElement(
    renderPreviewView(view, {
      ...context,
      el,
      ui: previewUi,
      dispatch: vi.fn()
    } satisfies RendererContext),
    'onboarding preview'
  );
}

function renderRuntimeSurface(surfaceId: RuntimeSurfaceId): HTMLElement {
  mountProductionStitchShell({
    controller: asOptionsController(createController()),
    initialOptions: SURFACE_INITIAL_OPTIONS,
    messages: DEFAULT_RUNTIME_MESSAGES,
    language: 'en'
  });

  queryRequired<HTMLElement>(`[data-footer-panel="${surfaceId}"]`);

  const draft = createCompleteOptions(SURFACE_INITIAL_OPTIONS);
  const appData = structuredClone(
    createProductionStitchAppData(draft, {
      maintenanceLog: previewContent.maintenanceLog
    })
  );

  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.previewLanguage = 'en';

  const context = createProductionStitchSchemaContext({
    appData,
    language: 'en',
    messages: DEFAULT_RUNTIME_MESSAGES,
    state
  });

  const view = getFooterView(surfaceId, context);
  if (!view) {
    throw new Error(`Missing runtime surface view: ${surfaceId}.`);
  }

  const rendered = renderRequiredElement(
    renderPreviewView(view, {
      ...context,
      el,
      ui: previewUi,
      dispatch: vi.fn()
    } satisfies RendererContext),
    `runtime surface ${surfaceId}`
  );
  document.body.append(rendered);
  return rendered;
}

describe('mountProductionStitchShell English residual coverage', () => {
  beforeEach(setupProductionStitchShellTest);

  it('keeps all six settings panels free of residual Chinese outside language options in English mode', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: DEFAULT_RUNTIME_MESSAGES,
      language: 'en'
    });

    const failures: string[] = [];

    for (const panelId of SETTINGS_PANEL_IDS) {
      queryRequired<HTMLButtonElement>(`[data-nav-panel="${panelId}"]`).click();
      await flushPromises();
      try {
        expectNoChineseSettingsCopy(queryRequired<HTMLElement>(`[data-panel-id="${panelId}"]`));
      } catch (error) {
        failures.push(`Panel ${panelId}: ${getErrorMessage(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  });

  it('keeps the onboarding page free of residual Chinese in English mode', () => {
    expectNoChineseSettingsCopy(renderOnboardingPage());
  });

  it('keeps every resource modal free of residual Chinese in English mode', async () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: DEFAULT_RUNTIME_MESSAGES,
      language: 'en'
    });

    const failures: string[] = [];

    for (const resourceId of RESOURCE_MODAL_IDS) {
      queryRequired<HTMLButtonElement>(`[data-footer-panel="${resourceId}"]`).click();
      await flushPromises();

      const modal = queryRequired<HTMLElement>('.resource-modal-overlay');
      try {
        expectNoChineseSettingsCopy(modal);
      } catch (error) {
        failures.push(`Resource ${resourceId}: ${getErrorMessage(error)}`);
      }

      modal.click();
      await flushPromises();
    }

    for (const { label, resourceId } of RESOURCE_LINKS) {
      findButton(label).click();
      await flushPromises();

      const modal = queryRequired<HTMLElement>('.resource-modal-overlay');
      try {
        expectNoChineseSettingsCopy(modal);
      } catch (error) {
        failures.push(`Resource ${resourceId}: ${getErrorMessage(error)}`);
      }

      modal.click();
      await flushPromises();
    }

    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  });

  it('keeps every runtime surface preview free of residual Chinese in English mode', () => {
    const failures: string[] = [];

    for (const surfaceId of RUNTIME_SURFACE_IDS) {
      let surface: HTMLElement | null = null;
      try {
        surface = renderRuntimeSurface(surfaceId);
        expectNoChineseSettingsCopy(surface);
      } catch (error) {
        failures.push(`Surface ${surfaceId}: ${getErrorMessage(error)}`);
      } finally {
        surface?.remove();
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  });
});
