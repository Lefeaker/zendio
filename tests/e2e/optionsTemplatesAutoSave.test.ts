/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StoredOptions } from '../../src/shared/types/options';
import type { OptionsPersistenceService } from '../../src/options/services/persistence';
import { createOptionsController } from '../../src/options/app/optionsController';
import {
  registerOptionsController,
  consumePendingAutoSaveSource,
  resetOptionsController
} from '../../src/options/app/optionsControllerContext';
import { showAutoSaveNotice } from '../../src/options/app/bootstrap';
import { TemplatesSection } from '../../src/options/components/sections/TemplatesSection';
import { FormSectionRegistry } from '../../src/options/components/formSections/formSectionManager';
import { createOptionsFormAdapter } from '../../src/options/components/optionsFormAdapter';
import { withDomEnvironment } from '../utils/domEnvironment';
import { createOptionsStateManager } from '../../src/options/state/StateManager';
import { MockOptionsRepository } from '../utils/repositories';

describe('options templates auto-save e2e', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    resetOptionsController();
  });

  it('shows success toast when reading template change auto-saves', async () => {
    const savedOptions: StoredOptions[] = [];
    const persistence: OptionsPersistenceService = {
      load: vi.fn(() =>
        Promise.resolve({
          rest: {
            baseUrl: 'https://api.example.com',
            vault: 'VaultOne',
            apiKey: 'secret'
          },
        templates: {
          article: 'Articles/{slug}.md',
          fragment: 'Fragments/{slug}.md',
          reading: 'Reading/{slug}.md',
          ai: 'AI/{slug}.md'
        },
          fragmentClipper: {
            useFootnoteFormat: false,
            captureContext: true,
            contextLength: 200,
            contextMode: 'chars',
            selectionModifierEnabled: false,
            selectionModifierKeys: [],
            keyboardShortcutsEnabled: true
          }
        } as StoredOptions)
      ),
      save: vi.fn((options) => {
        savedOptions.push(options as StoredOptions);
        return Promise.resolve();
      }),
      getCached: vi.fn(() => undefined)
    };

    await withDomEnvironment(
      `
        <!DOCTYPE html>
        <html lang="en">
          <body>
            <main>
              <span id="msg" class="aobx-status-message"></span>
              <section id="templates-section"></section>
            </main>
          </body>
        </html>
      `,
      {
        url: 'https://options.test/',
        globals: [
          'document',
          'navigator',
          'HTMLElement',
          'HTMLInputElement',
          'HTMLSelectElement',
          'HTMLButtonElement',
          'Node'
        ]
      },
      async ({ window }) => {
        const formRegistry = new FormSectionRegistry();
        const formAdapter = createOptionsFormAdapter(formRegistry);

        const controller = createOptionsController({
          persistence,
          formAdapter,
          formRegistry,
          autoSaveDebounceMs: 25,
          onSaveSuccess: (reason) => {
            if (reason !== 'auto') {
              return;
            }
            const source = consumePendingAutoSaveSource();
            if (!source) {
              return;
            }
            void showAutoSaveNotice(source);
          }
        });

        registerOptionsController(controller);

        const optionsRepo = new MockOptionsRepository();
        let section: TemplatesSection | null = null;
        try {
          const initial = await controller.loadInitialState();

          const container = window.document.getElementById('templates-section');
          if (!container) {
            throw new Error('templates container missing');
          }

          section = new TemplatesSection(container, optionsRepo);
          const stateManager = createOptionsStateManager();
          section.render({ stateManager, formRegistry });

          await controller.applyToForm(initial);

          const select = container.querySelector<HTMLSelectElement>('select');
          expect(select).not.toBeNull();
          if (!select) {
            throw new Error('reading mode select missing');
          }

          select.value = 'article';
          select.dispatchEvent(new Event('change', { bubbles: true }));

          await vi.advanceTimersByTimeAsync(30);
          await Promise.resolve();

          const message = window.document.getElementById('msg');
          expect(message?.textContent?.trim()).toBe('Template settings saved automatically.');
          expect(message?.className).toContain('is-success');

          expect(savedOptions.length).toBeGreaterThan(0);
          const lastSaved = savedOptions.at(-1);
          expect(lastSaved?.templates?.reading).toBe('Articles/{slug}.md');
        } finally {
          section?.destroy();
          formRegistry.clear();
          controller.dispose();
          resetOptionsController();
        }
      }
    );

  });
});
