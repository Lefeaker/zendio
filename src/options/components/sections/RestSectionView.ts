import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import { configProvider } from '@shared/config';
import type { VaultConfig } from '@shared/types/vault';
import { subscribeVaultRouter, getVaultRouterConfig } from '../../state/vaultRouterStore';
import { VaultRouterController } from '../controls/vaultRouterController';
import { getOptionsController, markPendingAutoSave } from '../../app/optionsControllerContext';
import type { ConnectionTester } from '../controls/connectionTest';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';
import {
  collectAdditionalVaultConfigsForTest,
  collectRestDraftForTest,
  collectRestSectionChanges,
  readRestRowValue,
  resolveRestDefaultVaultId
} from './restSectionState';
import { buildRestSectionLayout } from './restSectionLayout';
import {
  renderRestConnectionTestResult,
  resetRestConnectionTestResult
} from '@options/app/rest-settings/restSectionConnectionResult';
import {
  createRestSectionConnectionTester,
  applyRestSectionRepositorySnapshot,
  registerRestSectionFormBinding,
  subscribeRestSectionRepository
} from './restSectionRuntime';
import { createRestSectionLocalFolderActions } from './restSectionLocalFolders';
import { renderRestSectionVaultRows } from './restSectionVaultRowsRenderer';
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
  private defaultLocalFolderButton: HTMLButtonElement | null = null;
  private defaultHttpsInput: HTMLInputElement | null = null;
  private defaultHttpInput: HTMLInputElement | null = null;
  private defaultApiKeyInput: HTMLInputElement | null = null;
  private isApplyingSnapshot = false;
  private readonly localFolders = createRestSectionLocalFolderActions({
    getDefaultName: () => this.defaultNameInput?.value,
    getDefaultButton: () => this.defaultLocalFolderButton,
    updateDefaultFolder: (selection) => this.updateDefaultVaultField('localFolder', selection),
    updateVault: (id, updates) => this.vaultRouterController.updateVault(id, updates),
    renderError: (message) => this.renderConnectionTestResult('error', message)
  });

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
    this.defaultLocalFolderButton = null;
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
      this.defaultVaultId = resolveRestDefaultVaultId(state.vaults, state.defaultVaultId);
      this.renderAdditionalVaultRows(state.vaults, state.defaultVaultId);
    });
    const snapshot = getVaultRouterConfig();
    this.defaultVaultId = resolveRestDefaultVaultId(snapshot?.vaults, snapshot?.defaultVaultId);
    this.renderAdditionalVaultRows(snapshot?.vaults ?? [], snapshot?.defaultVaultId);
    this.subscribeToRepository();
    void this.optionsRepo.get().then((options) => {
      try {
        this.applySnapshot(options);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('destroyed')) {
          throw error;
        }
      }
    });
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
      chooseDefaultLocalFolder: () => {
        void this.localFolders.chooseDefault();
      },
      clearDefaultLocalFolder: () => this.localFolders.clearDefault(),
      addVault: () => this.vaultRouterController.addVault()
    });
    this.additionalRowsHost = layout.additionalRowsHost;
    this.additionalEmptyHint = layout.additionalEmptyHint;
    this.connectionResultHost = layout.connectionResultHost;
    this.defaultNameInput = layout.defaultNameInput;
    this.defaultLocalFolderButton = layout.defaultLocalFolderButton;
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
  private getDefaultInputs() {
    return {
      nameInput: this.defaultNameInput,
      localFolderButton: this.defaultLocalFolderButton,
      httpsInput: this.defaultHttpsInput,
      httpInput: this.defaultHttpInput,
      apiKeyInput: this.defaultApiKeyInput
    };
  }
  private renderAdditionalVaultRows(vaults: VaultConfig[], defaultVaultId?: string): void {
    renderRestSectionVaultRows({
      additionalRowsHost: this.additionalRowsHost,
      additionalEmptyHint: this.additionalEmptyHint,
      vaults,
      ...(defaultVaultId !== undefined ? { defaultVaultId } : {}),
      createElement: (tagName: string) =>
        this.createElement(tagName as keyof HTMLElementTagNameMap),
      messages: this.messages,
      updateVault: (vaultId, updates) => this.vaultRouterController.updateVault(vaultId, updates),
      removeVault: (vaultId) => this.vaultRouterController.removeVault(vaultId),
      localFolders: this.localFolders
    });
  }
  private updateDefaultVaultField(
    field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey' | 'localFolder',
    rawValue: string | { id?: string | undefined; name?: string | undefined }
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
      const trimmed = String(rawValue).trim();
      updates.vault = trimmed;
      updates.name = trimmed;
    } else if (field === 'httpsUrl') {
      updates.httpsUrl = String(rawValue).trim();
    } else if (field === 'httpUrl') {
      updates.httpUrl = String(rawValue).trim();
    } else if (field === 'apiKey') {
      updates.apiKey = String(rawValue);
    } else if (field === 'localFolder' && typeof rawValue === 'object') {
      updates.localFolderId = rawValue.id;
      updates.localFolderName = rawValue.name;
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
    applyRestSectionRepositorySnapshot({
      snapshot: options,
      defaultInputs: this.getDefaultInputs(),
      defaultVaultId: this.defaultVaultId,
      defaults: REST_DEFAULTS,
      setApplyingSnapshot: (isApplying) => {
        this.isApplyingSnapshot = isApplying;
      },
      updateDefaultVaultField: (field, value) => this.updateDefaultVaultField(field, value)
    });
  }
  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    return collectRestSectionChanges({
      previous,
      defaultInputs: this.getDefaultInputs(),
      defaults: REST_DEFAULTS
    });
  }
  private initializeConnectionTester(): void {
    this.connectionTester?.dispose();
    this.connectionTester = createRestSectionConnectionTester({
      button: this.container.querySelector<HTMLButtonElement>('#testConnectionBtn'),
      resultHost: this.container.querySelector<HTMLDivElement>('#connectionResult'),
      defaultInputs: this.getDefaultInputs(),
      additionalRowsHost: this.additionalRowsHost,
      defaultVaultId: this.defaultVaultId,
      messagingRepo: this.messagingRepo
    });
  }
  private collectRestDraftForTest(): Partial<RestOptions> {
    return collectRestDraftForTest(this.getDefaultInputs());
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
