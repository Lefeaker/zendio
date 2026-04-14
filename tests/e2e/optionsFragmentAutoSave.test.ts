/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StoredOptions } from '../../src/shared/types/options';
import { createOptionsController } from '../../src/options/app/optionsController';
import { createOptionsFormAdapter } from '../../src/options/components/optionsFormAdapter';
import {
  registerOptionsController,
  resetOptionsController
} from '../../src/options/app/optionsControllerContext';
import { FragmentSection } from '../../src/options/components/sections/FragmentSection';
import { FormSectionRegistry } from '../../src/options/components/formSections/formSectionManager';
import { withDomEnvironment } from '../utils/domEnvironment';
import { createOptionsStateManager } from '../../src/options/state/StateManager';
import type { IOptionsRepository } from '../../src/shared/repositories';

const fragmentMocks = vi.hoisted(() => ({
  registerHighlighter: vi.fn(),
  unregisterHighlighter: vi.fn()
}));

vi.mock('../../src/options/components/sectionRegistry', () => ({
  registerFragmentShortcutsHighlighter: fragmentMocks.registerHighlighter,
  unregisterFragmentShortcutsHighlighter: fragmentMocks.unregisterHighlighter,
  registerReadingTemplateHighlight: vi.fn(),
  unregisterReadingTemplateHighlight: vi.fn(),
  highlightFragmentShortcuts: vi.fn()
}));

describe('options fragment auto-save e2e', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    resetOptionsController();
  });

  it('auto-saves fragment context settings after user input', async () => {
    const savedOptions: StoredOptions[] = [];
    const persistence = {
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
            useFootnoteFormat: true,
            captureContext: false,
            contextLength: 200,
            contextMode: 'chars',
            selectionModifierEnabled: false,
            selectionModifierKeys: [],
            keyboardShortcutsEnabled: true
          }
        } as StoredOptions)
      ),
      save: vi.fn((options: StoredOptions) => {
        savedOptions.push(options);
        return Promise.resolve();
      }),
      getCached: vi.fn(() => null)
    };

    await withDomEnvironment(
      `
        <!DOCTYPE html>
        <html lang="en">
          <body>
            <main>
              <span id="msg" class="aobx-status-message"></span>
              <section id="fragment-section"></section>
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
          onSaveSuccess: () => {}
        });

        registerOptionsController(controller);

        let section: FragmentSection | null = null;
        try {
          const initial = await controller.loadInitialState();
          const container = window.document.getElementById('fragment-section');
          if (!container) {
            throw new Error('fragment section container missing');
          }

          const optionsRepo: IOptionsRepository = {
            async get() {
              return (await persistence.load()) as never;
            },
            async set() {},
            onChange() {
              return () => undefined;
            }
          };

          section = new FragmentSection(container, optionsRepo);
          const stateManager = createOptionsStateManager();
          section.render({ stateManager, formRegistry });

          await controller.applyToForm(initial);

          const captureCheckbox =
            container.querySelector<HTMLInputElement>('#fragmentCaptureContext');
          const contextLengthInput =
            container.querySelector<HTMLInputElement>('#fragmentContextLength');
          const contextModeSelect =
            container.querySelector<HTMLSelectElement>('#fragmentContextMode');

          if (!captureCheckbox || !contextLengthInput || !contextModeSelect) {
            throw new Error('fragment inputs not found');
          }

          captureCheckbox.checked = true;
          captureCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

          contextLengthInput.value = '256';
          contextLengthInput.dispatchEvent(new window.Event('change', { bubbles: true }));

          contextModeSelect.value = 'sentences';
          contextModeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));

          await vi.advanceTimersByTimeAsync(30);
          await Promise.resolve();

          expect(savedOptions.length).toBeGreaterThan(0);
          const lastSaved = savedOptions.at(-1);
          expect(lastSaved?.fragmentClipper?.captureContext).toBe(true);
          expect(lastSaved?.fragmentClipper?.contextLength).toBe(256);
          expect(lastSaved?.fragmentClipper?.contextMode).toBe('sentences');
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
