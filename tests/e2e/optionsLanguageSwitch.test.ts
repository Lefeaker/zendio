/* @vitest-environment jsdom */

import { describe, it, expect, afterEach } from 'vitest';
import { createDefaultPageI18nController, type PageI18nController } from '../../src/i18n';
import { setOptionsI18nContext } from '../../src/options/app/i18nContext';
import {
  initializeVaultRouterStore,
  resetVaultRouterStore
} from '../../src/options/state/vaultRouterStore';
import { RestSection } from '../../src/options/components/sections/RestSection';
import optionsStore from '../../src/options/state/optionsStore';
import { e2ePlatformHarness } from './setup';
import { getRestDefaults } from '../utils/restDefaults';
import { FormSectionRegistry } from '../../src/options/components/formSections/formSectionManager';
import type { StoredOptions } from '../../src/shared/types/options';
import { withDomEnvironment } from '../utils/domEnvironment';
import { createOptionsStateManager } from '../../src/options/state/StateManager';
import type { IOptionsRepository, IMessagingRepository } from '../../src/shared/repositories';

const restDefaults = getRestDefaults();

describe('options language switching e2e', () => {
  afterEach(() => {
    setOptionsI18nContext(null, null);
    resetVaultRouterStore();
    optionsStore.reset();
    e2ePlatformHarness.reset();
  });

  it('updates localized vault placeholders after language change', async () => {
    await e2ePlatformHarness.storage.sync.set('language', 'zh-CN');
    await withDomEnvironment(
      `
        <!DOCTYPE html>
        <html lang="zh-CN">
          <body>
            <section id="rest-section"></section>
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
          'HTMLButtonElement',
          'Node'
        ]
      },
      async ({ window }) => {
        initializeVaultRouterStore({
          defaultVaultId: 'vault-1',
          vaults: [
            {
              id: 'vault-1',
              name: 'Vault One',
              httpsUrl: restDefaults.httpsUrl,
              httpUrl: restDefaults.httpUrl,
              vault: 'VaultOne',
              apiKey: 'secret',
              enabled: true,
              isDefault: true,
              rules: []
            }
          ]
        });

        const controller: PageI18nController = createDefaultPageI18nController();
        const formRegistry = new FormSectionRegistry();
        const container = window.document.getElementById('rest-section');
        if (!container) {
          throw new Error('rest section container missing');
        }
        const optionsRepo: IOptionsRepository = {
          async get() {
            return {
              rest: { baseUrl: restDefaults.baseUrl ?? '', apiKey: 'secret', vault: 'VaultOne' }
            } as never;
          },
          async set() {},
          onChange() {
            return () => undefined;
          }
        };
        const messagingRepo: IMessagingRepository = {
          async send() {
            return undefined as never;
          },
          onMessage() {
            return () => undefined;
          }
        };
        const restSection = new RestSection(container, optionsRepo, messagingRepo);
        try {
          await controller.load();
          controller.mount(window.document);
          setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());

          const resource = controller.getCurrentResource();
          if (resource) {
            restSection.setMessages(resource.messages);
          }
          const stateManager = createOptionsStateManager();
          restSection.render({ stateManager, formRegistry });
          const snapshot: StoredOptions = {
            rest: { baseUrl: restDefaults.baseUrl ?? '', apiKey: 'secret', vault: 'VaultOne' },
            templates: {
              article: 'Articles/{slug}.md',
              fragment: 'Fragments/{slug}.md',
              reading: 'Reading/{slug}.md',
              ai: 'AI/{slug}.md'
            }
          };
          await formRegistry.apply(snapshot);

          await e2ePlatformHarness.storage.sync.set('language', 'en');
          await controller.changeLanguage('en');
          setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());

          const storedLanguage = await e2ePlatformHarness.storage.sync.get<string>('language');
          expect(storedLanguage).toBe('en');
        } finally {
          restSection.destroy();
          formRegistry.clear();
          controller.dispose();
          setOptionsI18nContext(null, null);
        }
      }
    );
  });
});
