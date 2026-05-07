import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import { configProvider } from '@shared/config';
import type { VaultConfig } from '@shared/types/vault';
import {
  subscribeVaultRouter,
  getVaultRouterConfig,
  initializeVaultRouterStore
} from '../../state/vaultRouterStore';
import { VaultRouterController } from '../controls/vaultRouterController';
import { getOptionsController, markPendingAutoSave } from '../../app/optionsControllerContext';
import type { ConnectionTester } from '../controls/connectionTest';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';
import {
  applyRestSectionSnapshot,
  collectAdditionalVaultConfigsForTest,
  collectRestDraftForTest,
  collectRestSectionChanges,
  readRestRowValue
} from './restSectionState';
import { buildRestSectionLayout, buildRestVaultRow } from './restSectionLayout';
import {
  renderRestConnectionTestResult,
  resetRestConnectionTestResult
} from './restSectionConnectionResult';
import { renderRestVaultRows } from './restSectionVaultRow';
import {
  createRestSectionConnectionTester,
  registerRestSectionFormBinding,
  subscribeRestSectionRepository
} from './restSectionRuntime';
const REST_DEFAULTS = configProvider.getRestDefaults();
export class RestSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private readonly messagingRepo: IMessagingRepository;
  private readonly vaultRouterController = new VaultRouterController();
  private defaultVaultId: string | null = null;
  private additionalRowsHost: HTMLElement | null = null;
  private additionalEmptyHint: HTMLElement | null = null;
  private unsubscribeVaultStore: (() => void) | null = null;
  private connectionTester: ConnectionTester | null = null;
  private connectionResultHost: HTMLDivElement | null = null;
  private unsubscribeRepo: (() => void) | null = null;
  private defaultNameInput: HTMLInputElement | null = null;
  private defaultHttpsInput: HTMLInputElement | null = null;
  private defaultHttpInput: HTMLInputElement | null = null;
  private defaultApiKeyInput: HTMLInputElement | null = null;
  private isApplyingSnapshot = false;

  constructor(
    container: HTMLElement,
    optionsRepo: IOptionsRepository,
    messagingRepo: IMessagingRepository
  ) {
    super(container);
    this.optionsRepo = optionsRepo;
    this.messagingRepo = messagingRepo;
  }
  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    if (this.messages) {
      this.vaultRouterController.setMessages(this.messages);
    }
    this.vaultRouterController.render();
    this.applySectionChrome();
    this.defaultNameInput = null;
    this.defaultHttpsInput = null;
    this.defaultHttpInput = null;
    this.defaultApiKeyInput = null;
    const header = this.buildSectionHeader({
      title: this.messages?.apiConfigTitle ?? 'Obsidian Local REST API',
      description: this.messages?.apiConfigHint ?? '配置默认仓库和额外仓库的连接信息'
    });
    const body = this.buildBody();
    this.container.replaceChildren(header, body);
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = subscribeVaultRouter((state) => {
      this.defaultVaultId =
        state.defaultVaultId ??
        state.vaults.find((vault) => vault.isDefault)?.id ??
        state.vaults[0]?.id ??
        null;
      this.renderAdditionalVaultRows(state.vaults, state.defaultVaultId);
    });
    const snapshot = getVaultRouterConfig();
    this.defaultVaultId =
      snapshot?.defaultVaultId ??
      snapshot?.vaults?.find((vault) => vault.isDefault)?.id ??
      snapshot?.vaults?.[0]?.id ??
      null;
    this.renderAdditionalVaultRows(snapshot?.vaults ?? [], snapshot?.defaultVaultId);
    this.subscribeToRepository();
    this.registerFormIntegration();
    this.initializeConnectionTester();
    return this.container;
  }
  override destroy(): void {
    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = null;
    this.additionalRowsHost = null;
    this.additionalEmptyHint = null;
    this.connectionTester?.dispose();
    this.connectionTester = null;
    this.connectionResultHost = null;
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.unregisterManagedFormSection();
    this.vaultRouterController.dispose();
    super.destroy();
  }
  private buildBody(): HTMLElement {
    const layout = buildRestSectionLayout({
      createElement: (tagName: string) =>
        this.createElement(tagName as keyof HTMLElementTagNameMap),
      messages: this.messages,
      updateDefaultVaultField: (field, value) => this.updateDefaultVaultField(field, value),
      addVault: () => this.vaultRouterController.addVault()
    });
    this.additionalRowsHost = layout.additionalRowsHost;
    this.additionalEmptyHint = layout.additionalEmptyHint;
    this.connectionResultHost = layout.connectionResultHost;
    this.defaultNameInput = layout.defaultNameInput;
    this.defaultHttpsInput = layout.defaultHttpsInput;
    this.defaultHttpInput = layout.defaultHttpInput;
    this.defaultApiKeyInput = layout.defaultApiKeyInput;
    return layout.body;
  }
  private renderConnectionTestResult(type: 'success' | 'error' | 'info', text: string): void {
    renderRestConnectionTestResult({ connectionResultHost: this.connectionResultHost, type, text });
  }
  private resetConnectionTestResult(): void {
    resetRestConnectionTestResult(this.connectionResultHost);
  }
  private renderAdditionalVaultRows(vaults: VaultConfig[], defaultVaultId?: string): void {
    renderRestVaultRows({
      additionalRowsHost: this.additionalRowsHost,
      additionalEmptyHint: this.additionalEmptyHint,
      vaults,
      ...(defaultVaultId !== undefined ? { defaultVaultId } : {}),
      createRow: (vault) =>
        buildRestVaultRow({
          createElement: (tagName: string) =>
            this.createElement(tagName as keyof HTMLElementTagNameMap),
          messages: this.messages,
          vault,
          updateVault: (vaultId, updates) =>
            this.vaultRouterController.updateVault(vaultId, updates),
          removeVault: (vaultId) => this.vaultRouterController.removeVault(vaultId)
        })
    });
  }
  private updateDefaultVaultField(
    field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey',
    rawValue: string
  ): void {
    if (!this.isApplyingSnapshot) {
      markPendingAutoSave('rest');
      getOptionsController()?.scheduleAutoSave();
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
    } else if (field === 'apiKey') {
      updates.apiKey = rawValue;
    }
    this.vaultRouterController.updateVault(this.defaultVaultId, updates, {
      silent: this.isApplyingSnapshot
    });
  }
  private registerFormIntegration(): void {
    registerRestSectionFormBinding({
      registerManagedFormSection: (sectionId, binding) =>
        this.registerManagedFormSection(sectionId, binding),
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    });
  }
  private applySnapshot(options: StoredOptions | CompleteOptions): void {
    initializeVaultRouterStore(options.vaultRouter ?? null);
    const router = getVaultRouterConfig() ?? null;
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
      vaultRouterSnapshot: router,
      defaults: REST_DEFAULTS
    });
    if (this.defaultVaultId) {
      this.updateDefaultVaultField('name', resolved.name);
      this.updateDefaultVaultField('httpsUrl', resolved.httpsUrl);
      this.updateDefaultVaultField('httpUrl', resolved.httpUrl);
      this.updateDefaultVaultField('apiKey', resolved.apiKey);
    }
    this.isApplyingSnapshot = false;
  }
  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    return collectRestSectionChanges({
      previous,
      defaultInputs: {
        nameInput: this.defaultNameInput,
        httpsInput: this.defaultHttpsInput,
        httpInput: this.defaultHttpInput,
        apiKeyInput: this.defaultApiKeyInput
      },
      defaults: REST_DEFAULTS
    });
  }
  private initializeConnectionTester(): void {
    this.connectionTester?.dispose();
    this.connectionTester = createRestSectionConnectionTester({
      button: this.container.querySelector<HTMLButtonElement>('#testConnectionBtn'),
      resultHost: this.container.querySelector<HTMLDivElement>('#connectionResult'),
      defaultInputs: {
        nameInput: this.defaultNameInput,
        httpsInput: this.defaultHttpsInput,
        httpInput: this.defaultHttpInput,
        apiKeyInput: this.defaultApiKeyInput
      },
      additionalRowsHost: this.additionalRowsHost,
      defaultVaultId: this.defaultVaultId,
      messagingRepo: this.messagingRepo
    });
  }
  private collectRestDraftForTest(): Partial<RestOptions> {
    return collectRestDraftForTest({
      nameInput: this.defaultNameInput,
      httpsInput: this.defaultHttpsInput,
      httpInput: this.defaultHttpInput,
      apiKeyInput: this.defaultApiKeyInput
    });
  }
  private collectAdditionalVaultConfigsForTest(): VaultConfig[] {
    return collectAdditionalVaultConfigsForTest({
      additionalRowsHost: this.additionalRowsHost,
      vaultRouterSnapshot: getVaultRouterConfig() ?? null,
      defaultVaultId: this.defaultVaultId
    });
  }
  private readRowValue(row: HTMLElement, selector: string, trim = true): string | null {
    return readRestRowValue(row, selector, trim);
  }
  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = subscribeRestSectionRepository(this.optionsRepo, (options) => {
      this.applySnapshot(options);
    });
  }
}
