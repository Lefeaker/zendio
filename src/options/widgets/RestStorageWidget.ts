import { configProvider } from '@shared/config/provider';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { VaultConfig } from '@shared/types/vault';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import { getOptionsMessages } from '@options/app/i18nContext';
import { VaultRouterController } from '@options/components/controls/vaultRouterController';
import {
  createConnectionTester,
  type ConnectionTester
} from '@options/components/controls/connectionTest';
import { buildRestSectionLayout, buildRestVaultRow } from './shared/rest/restSectionLayout';
import { renderRestVaultRows } from './shared/rest/restSectionVaultRow';
import {
  applyRestSectionSnapshot,
  collectAdditionalVaultConfigsForTest,
  collectRestDraftForTest,
  collectRestSectionChanges
} from './shared/rest/restSectionState';
import {
  requestConnectionTest,
  requestVaultConnectionTest
} from '@options/services/connectionTester';
import {
  subscribeVaultRouter,
  getVaultRouterConfig,
  initializeVaultRouterStore
} from '@options/state/vaultRouterStore';
import type { WidgetMountContract, WidgetRuntime, BaseWidgetProps } from './contracts';
import { asOptionsSnapshot, createElement } from './utils';

const REST_DEFAULTS = configProvider.getRestDefaults();

export interface RestStorageWidgetDependencies {
  optionsRepository: IOptionsRepository;
  messagingRepository?: IMessagingRepository;
}

export interface RestStorageWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class RestStorageWidget
  implements
    WidgetMountContract<
      RestStorageWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private readonly deps: RestStorageWidgetDependencies;
  private runtime: WidgetRuntime | undefined;
  private props: RestStorageWidgetProps = {};
  private container: HTMLElement | null = null;
  private shellHost: HTMLElement | null = null;
  private controller = new VaultRouterController();
  private defaultVaultId: string | null = null;
  private additionalRowsHost: HTMLElement | null = null;
  private additionalEmptyHint: HTMLElement | null = null;
  private connectionResultHost: HTMLDivElement | null = null;
  private defaultNameInput: HTMLInputElement | null = null;
  private defaultHttpsInput: HTMLInputElement | null = null;
  private defaultHttpInput: HTMLInputElement | null = null;
  private defaultApiKeyInput: HTMLInputElement | null = null;
  private isApplyingSnapshot = false;
  private unsubscribeVaultStore: (() => void) | null = null;
  private unsubscribeRepo: (() => void) | null = null;
  private connectionTester: ConnectionTester | null = null;
  private lastAppliedOptions: StoredOptions | CompleteOptions | null = null;

  constructor(dependencies: RestStorageWidgetDependencies) {
    this.deps = dependencies;
  }

  mount(container: HTMLElement, props: RestStorageWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.props = props;
    this.runtime = runtime;
    if (props.messages) {
      this.controller.setMessages(props.messages);
    }
    this.controller.render({
      autoSave: false,
      onChange: () => {
        this.runtime?.notifyDirty?.(['rest', 'vaultRouter']);
      }
    });
    this.render();
    this.subscribeStores();
    this.initializeConnectionTester();
    if (props.options) {
      this.applySnapshot(props.options);
    }
  }

  update(props: RestStorageWidgetProps, runtime?: WidgetRuntime): void {
    this.props = props;
    this.runtime = runtime ?? this.runtime;
    if (props.messages) {
      this.controller.setMessages(props.messages);
    }
    if (props.options) {
      this.applySnapshot(props.options);
    }
  }

  destroy(): void {
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = null;
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.connectionTester?.dispose();
    this.connectionTester = null;
    this.controller.dispose();
    this.container = null;
    this.shellHost = null;
    this.additionalRowsHost = null;
    this.additionalEmptyHint = null;
    this.connectionResultHost = null;
    this.defaultNameInput = null;
    this.defaultHttpsInput = null;
    this.defaultHttpInput = null;
    this.defaultApiKeyInput = null;
  }

  collect(): Partial<CompleteOptions> {
    return collectRestSectionChanges({
      previous: this.lastAppliedOptions ?? null,
      defaultInputs: {
        nameInput: this.defaultNameInput,
        httpsInput: this.defaultHttpsInput,
        httpInput: this.defaultHttpInput,
        apiKeyInput: this.defaultApiKeyInput
      },
      defaults: REST_DEFAULTS
    });
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot);
    this.lastAppliedOptions = options;
    initializeVaultRouterStore(options.vaultRouter ?? null);
    const routerSnapshot = getVaultRouterConfig() ?? null;
    this.defaultVaultId =
      routerSnapshot?.defaultVaultId ??
      routerSnapshot?.vaults.find((vault) => vault.isDefault)?.id ??
      routerSnapshot?.vaults[0]?.id ??
      null;
    this.isApplyingSnapshot = true;
    const resolved = applyRestSectionSnapshot({
      options,
      defaultInputs: {
        nameInput: this.defaultNameInput,
        httpsInput: this.defaultHttpsInput,
        httpInput: this.defaultHttpInput,
        apiKeyInput: this.defaultApiKeyInput
      },
      defaultVaultId: this.defaultVaultId,
      vaultRouterSnapshot: routerSnapshot,
      defaults: REST_DEFAULTS
    });
    if (this.defaultVaultId) {
      this.updateDefaultVaultField('name', resolved.name);
      this.updateDefaultVaultField('httpsUrl', resolved.httpsUrl);
      this.updateDefaultVaultField('httpUrl', resolved.httpUrl);
      this.updateDefaultVaultField('apiKey', resolved.apiKey);
    }
    this.isApplyingSnapshot = false;
    this.renderAdditionalVaultRows(routerSnapshot?.vaults ?? [], routerSnapshot?.defaultVaultId);
  }

  private render(): void {
    if (!this.container) {
      return;
    }
    this.shellHost = createElement(
      'div',
      'schema-widget-stack schema-storage-widget-shell schema-storage-rest-shell'
    );
    this.shellHost.append(this.buildHeader());

    const layout = buildRestSectionLayout({
      createElement: document.createElement.bind(document),
      messages: this.props.messages ?? null,
      updateDefaultVaultField: (field, value) => this.updateDefaultVaultField(field, value),
      addVault: () => {
        this.controller.addVault();
        this.runtime?.notifyDirty?.(['rest', 'vaultRouter']);
      }
    });
    this.additionalRowsHost = layout.additionalRowsHost;
    this.additionalEmptyHint = layout.additionalEmptyHint;
    this.connectionResultHost = layout.connectionResultHost;
    this.defaultNameInput = layout.defaultNameInput;
    this.defaultHttpsInput = layout.defaultHttpsInput;
    this.defaultHttpInput = layout.defaultHttpInput;
    this.defaultApiKeyInput = layout.defaultApiKeyInput;
    const [tableNode, controlsNode, connectionNode, noteNode] = Array.from(layout.body.children);

    if (controlsNode instanceof HTMLElement) {
      controlsNode.classList.add('schema-output-toolbar', 'schema-storage-actions');
      this.shellHost.append(controlsNode);
    }

    const tableWrap = createElement('section', 'schema-table-wrap schema-storage-rest-table-wrap');
    if (tableNode instanceof HTMLElement) {
      tableNode.classList.add('schema-storage-table-host');
      tableNode.firstElementChild?.classList.add('schema-storage-rest-surface');
      const tableGrid = tableNode.firstElementChild?.firstElementChild;
      if (tableGrid instanceof HTMLElement) {
        tableGrid.classList.add('schema-storage-table-grid');
        tableGrid.firstElementChild?.classList.add('schema-storage-header-row');
      }
      tableWrap.append(tableNode);
    }
    this.shellHost.append(tableWrap);

    if (connectionNode instanceof HTMLElement) {
      connectionNode.classList.add('schema-storage-connection-result');
      this.shellHost.append(connectionNode);
    }

    if (noteNode instanceof HTMLElement) {
      noteNode.classList.add('schema-widget-note');
      this.shellHost.append(noteNode);
    }

    this.container.replaceChildren(this.shellHost);
  }

  private subscribeStores(): void {
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = subscribeVaultRouter((state) => {
      this.defaultVaultId =
        state.defaultVaultId ??
        state.vaults.find((vault) => vault.isDefault)?.id ??
        state.vaults[0]?.id ??
        null;
      this.renderAdditionalVaultRows(state.vaults, state.defaultVaultId);
    });
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.deps.optionsRepository.onChange((options) => {
      this.applySnapshot(options);
    });
  }

  private renderAdditionalVaultRows(vaults: VaultConfig[], defaultVaultId?: string): void {
    renderRestVaultRows({
      additionalRowsHost: this.additionalRowsHost,
      additionalEmptyHint: this.additionalEmptyHint,
      vaults,
      ...(defaultVaultId !== undefined ? { defaultVaultId } : {}),
      createRow: (vault) =>
        buildRestVaultRow({
          createElement: document.createElement.bind(document),
          messages: this.props.messages ?? null,
          vault,
          updateVault: (vaultId, updates) => {
            this.controller.updateVault(vaultId, updates);
            this.runtime?.notifyDirty?.(['rest', 'vaultRouter']);
          },
          removeVault: (vaultId) => {
            this.controller.removeVault(vaultId);
            this.runtime?.notifyDirty?.(['rest', 'vaultRouter']);
          }
        })
    });
    this.additionalRowsHost?.querySelectorAll<HTMLElement>('[data-vault-id]').forEach((row) => {
      row.classList.add('schema-storage-grid-row');
    });
  }

  private updateDefaultVaultField(
    field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey',
    rawValue: string
  ): void {
    if (!this.isApplyingSnapshot) {
      this.runtime?.notifyDirty?.(['rest', 'vaultRouter']);
    }
    if (!this.defaultVaultId) {
      return;
    }

    const updates: Partial<VaultConfig> = {};
    if (field === 'name') {
      const trimmed = rawValue.trim();
      updates.vault = trimmed;
      updates.name = trimmed;
    } else if (field === 'httpsUrl') {
      updates.httpsUrl = rawValue.trim();
    } else if (field === 'httpUrl') {
      updates.httpUrl = rawValue.trim();
    } else {
      updates.apiKey = rawValue;
    }

    this.controller.updateVault(this.defaultVaultId, updates, {
      silent: this.isApplyingSnapshot
    });
  }

  private buildHeader(): HTMLElement {
    const header = createElement('div', 'schema-card-header schema-output-widget-header');
    const copy = createElement('div');
    const title = createElement('h3');
    title.textContent = this.props.messages?.apiConfigTitle ?? 'Obsidian Local REST API';
    const description = createElement('p');
    description.textContent =
      this.props.messages?.apiConfigHint ??
      'This is the default vault. Content that does not match a routing rule will land here.';
    copy.append(title, description);
    header.append(copy);
    return header;
  }

  private initializeConnectionTester(): void {
    this.connectionTester?.dispose();
    if (!this.deps.messagingRepository || !this.container) {
      this.connectionTester = null;
      return;
    }

    const button = this.container.querySelector<HTMLButtonElement>('#testConnectionBtn');
    const resultHost = this.container.querySelector<HTMLDivElement>('#connectionResult');
    if (!button || !resultHost) {
      this.connectionTester = null;
      return;
    }

    const messagingRepo = this.deps.messagingRepository;
    this.connectionTester = createConnectionTester({
      button,
      resultHost,
      getMessages: getOptionsMessages,
      getRestDraft: () =>
        collectRestDraftForTest({
          nameInput: this.defaultNameInput,
          httpsInput: this.defaultHttpsInput,
          httpInput: this.defaultHttpInput,
          apiKeyInput: this.defaultApiKeyInput
        }),
      getAdditionalVaultConfigs: () =>
        collectAdditionalVaultConfigsForTest({
          additionalRowsHost: this.additionalRowsHost,
          vaultRouterSnapshot: getVaultRouterConfig() ?? null,
          defaultVaultId: this.defaultVaultId
        }),
      runDefaultTest: (draft) => requestConnectionTest(draft, messagingRepo),
      runVaultTest: (vault) => requestVaultConnectionTest(vault, messagingRepo)
    });
  }
}
