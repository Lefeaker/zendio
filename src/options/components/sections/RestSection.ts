import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import { configProvider } from '@shared/config';
import type { VaultConfig } from '@shared/types/vault';
import {
  subscribeVaultRouter,
  getVaultRouterConfig,
  initializeVaultRouterStore
} from '../../state/vaultRouterStore';
import { VaultRouterController } from '../controls/vaultRouterController';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { DaisyButton } from '../shared/DaisyButton';
import { DaisyAlert } from '../shared/DaisyAlert';
import { DaisyInput } from '../shared/DaisyInput';
import { DaisyCard } from '../shared/DaisyCard';
import { DaisyTable } from '../shared/DaisyTable';
import { getOptionsMessages } from '../../app/i18nContext';
import { markPendingAutoSave } from '../../app/optionsControllerContext';
import { createConnectionTester, type ConnectionTester } from '../controls/connectionTest';
import type { ConnectionResultType } from '../../services/connectionTestRunner';
import {
  requestConnectionTest,
  requestVaultConnectionTest
} from '../../services/connectionTester';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

const REST_DEFAULTS = configProvider.getRestDefaults();

export class RestSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private readonly messagingRepo: IMessagingRepository;
  private readonly vaultRouterController = new VaultRouterController();
  private defaultVaultId: string | null = null;
  private additionalRowsHost: HTMLElement | null = null;
  private additionalEmptyHint: HTMLElement | null = null;
  private unsubscribeVaultStore: (() => void) | null = null;
  private formSectionBinding: FormSectionHandlers | null = null;
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
    optionsRepo?: IOptionsRepository,
    messagingRepo?: IMessagingRepository
  ) {
    super(container);
    this.optionsRepo = optionsRepo ?? resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    this.messagingRepo =
      messagingRepo ?? resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    if (this.messages) {
      this.vaultRouterController.setMessages(this.messages);
    }
    this.vaultRouterController.render();
    this.container.classList.add('aobx-section');

    this.defaultNameInput = null;
    this.defaultHttpsInput = null;
    this.defaultHttpInput = null;
    this.defaultApiKeyInput = null;

    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);

    this.unsubscribeVaultStore?.();
    this.unsubscribeVaultStore = subscribeVaultRouter((state) => {
      this.defaultVaultId =
        state.defaultVaultId ??
        state.vaults.find(vault => vault.isDefault)?.id ??
        state.vaults[0]?.id ??
        null;
      this.renderAdditionalVaultRows(state.vaults, state.defaultVaultId);
    });

    const snapshot = getVaultRouterConfig();
    this.defaultVaultId =
      snapshot?.defaultVaultId ??
      snapshot?.vaults?.find(vault => vault.isDefault)?.id ??
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
    if (this.formSectionBinding) {
      const registry = this.requireFormRegistry();
      registry.unregister('rest', this.formSectionBinding);
      this.formSectionBinding = null;
    }
    this.vaultRouterController.dispose();
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2 text-base-content');
    const title = document.createElement('h2');
    title.className = 'm-0 text-2xl font-semibold tracking-tight';
    title.textContent = this.messages?.apiConfigTitle ?? 'Obsidian Local REST API';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-base-content/60 text-md');
    subtitle.textContent =
      this.messages?.apiConfigHint ?? '配置默认仓库和额外仓库的连接信息';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const pad = this.createElement('div', 'mt-6 space-y-6');

    this.additionalRowsHost = this.createElement('div', 'divide-y divide-border/50');
    this.additionalEmptyHint = this.createElement('div', 'p-8 text-center text-base-content/60 italic');
    this.additionalEmptyHint.hidden = true;
    this.additionalEmptyHint.textContent =
      this.messages?.additionalVaultsHint ?? '添加更多仓库，通过路由规则自动分配内容';

    const tableHost = this.createElement('div');
    new DaisyTable(tableHost).render({
      minWidthClass: 'min-w-[900px]',
      header: this.buildVaultHeaderRow(),
      body: [this.buildDefaultRow(), this.additionalRowsHost, this.additionalEmptyHint]
    });

    pad.append(tableHost);
    pad.append(this.buildVaultControls());
    pad.append(this.buildConnectionResult());

    const note = this.createElement('p', 'text-sm text-base-content/60');
    note.textContent = '提示：第一行是默认仓库，不符合路由规则的内容将保存到这里。测试连接会验证表格中所有已启用的仓库。';
    pad.append(note);

    return pad;
  }

  private buildVaultHeaderRow(): HTMLElement {
    const labels = [
      this.messages?.ruleEnabledLabel ?? '启用',
      this.messages?.vaultNameLabel ?? '仓库名称',
      this.messages?.httpsUrlLabel ?? 'HTTPS URL',
      this.messages?.httpUrlLabel ?? 'HTTP URL',
      this.messages?.apiKeyLabel ?? 'API Key',
      '操作'
    ];

    const headerRow = this.createElement('div', 'grid grid-cols-[60px_140px_minmax(150px,1fr)_minmax(150px,1fr)_160px_80px] gap-2 p-3 bg-base-200 border-b border-base-300 font-medium text-base-content/60');
    for (const label of labels) {
      const cell = document.createElement('span');
      cell.textContent = label;
      headerRow.append(cell);
    }
    return headerRow;
  }

  private buildDefaultRow(): HTMLElement {
    const row = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-4');

    const heading = this.createElement('div', 'flex items-center justify-between gap-3');
    const badge = this.createElement('span', 'badge badge-accent badge-sm');
    badge.textContent = this.messages?.defaultVaultBadge ?? '默认仓库';
    heading.append(badge);

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'flex items-center gap-2 cursor-not-allowed opacity-50 text-sm text-base-content/60';
    // ✅ Phase 1 DaisyUI migration: 使用 .checkbox 基类
    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
    enabledCheckbox.checked = true;
    enabledCheckbox.disabled = true;
    enabledLabel.append(enabledCheckbox, document.createTextNode(this.messages?.ruleEnabledLabel ?? '启用'));
    heading.append(enabledLabel);
    row.append(heading);

    const fields = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4');

    const nameCell = this.buildRestInputCell(
      'restVault',
      this.messages?.vaultNamePlaceholder ?? '默认仓库',
      'text',
      (value) => this.updateDefaultVaultField('name', value)
    );
    const nameInput = nameCell.querySelector<HTMLInputElement>('input');
    if (nameInput) {
      nameInput.setAttribute('data-i18n-placeholder', 'vaultNamePlaceholder');
    }
    fields.append(this.wrapDefaultField(this.messages?.vaultNameLabel ?? '仓库名称', nameCell));

    fields.append(
      this.wrapDefaultField(this.messages?.httpsUrlLabel ?? 'HTTPS URL', this.buildRestInputCell(
        'restHttpsUrl',
        'https://127.0.0.1:27124/',
        'text',
        (value) => this.updateDefaultVaultField('httpsUrl', value)
      ))
    );
    fields.append(
      this.wrapDefaultField(this.messages?.httpUrlLabel ?? 'HTTP URL', this.buildRestInputCell(
        'restHttpUrl',
        'http://127.0.0.1:27123/',
        'text',
        (value) => this.updateDefaultVaultField('httpUrl', value)
      ))
    );
    fields.append(
      this.wrapDefaultField(this.messages?.apiKeyLabel ?? 'API Key', this.buildRestInputCell(
        'restKey',
        '••••••••',
        'password',
        (value) => this.updateDefaultVaultField('apiKey', value)
      ))
    );
    row.append(fields);

    const actions = this.createElement('div', 'flex justify-end');
    const spacerButton = this.createElement(
      'button',
      'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 px-3 opacity-0 cursor-default'
    );
    spacerButton.type = 'button';
    spacerButton.textContent = this.messages?.deleteVaultButton ?? '删除';
    spacerButton.disabled = true;
    spacerButton.setAttribute('aria-hidden', 'true');
    spacerButton.tabIndex = -1;
    actions.append(spacerButton);
    row.append(actions);

    const cardHost = this.createElement('div', 'p-3 border-b border-base-300/50 bg-base-100/50');
    new DaisyCard(cardHost).render({
      body: row
    });
    return cardHost;
  }

  private wrapDefaultField(labelText: string, field: HTMLElement): HTMLElement {
    const wrapper = this.createElement('div', 'grid gap-2');
    const label = this.createElement('label', 'text-xs font-medium text-base-content/60');
    label.textContent = labelText;
    wrapper.append(label, field);
    return wrapper;
  }

  private buildRestInputCell(
    id: string,
    placeholder: string,
    type: 'text' | 'password' = 'text',
    onInput?: (value: string) => void
  ): HTMLElement {
    const host = this.createElement('div', 'w-full');
    const daisyInput = new DaisyInput(host);
    const input = daisyInput.render({
      type,
      placeholder,
      variant: 'bordered',
      size: 'sm',
      onChange: (value) => {
        const next = type === 'password' ? value : value.trim();
        onInput?.(next);
      }
    });
    input.id = id;

    if (id === 'restVault') {
      this.defaultNameInput = input;
    } else if (id === 'restHttpsUrl') {
      this.defaultHttpsInput = input;
    } else if (id === 'restHttpUrl') {
      this.defaultHttpInput = input;
    } else if (id === 'restKey') {
      this.defaultApiKeyInput = input;
    }

    return host;
  }

  private buildVaultControls(): HTMLElement {
    const controls = this.createElement('div', 'flex flex-wrap gap-2 pt-2');

    // ✅ Stage 3 Week 3: Migrated add vault button to DaisyButton (RestSection)
    const addButtonHost = this.createElement('div');
    const addButton = new DaisyButton(addButtonHost).render({
      label: this.messages?.addVaultButton ?? '+ 添加仓库',
      variant: 'secondary',
      size: 'sm',
      iconName: 'Plus',
      onClick: () => {
        this.vaultRouterController.addVault();
      }
    });
    addButton.id = 'addAdditionalVaultBtn';
    controls.append(addButtonHost);

    // ✅ Stage 3 Week 3: Migrated test connection button to DaisyButton (RestSection)
    const testButton = new DaisyButton(this.createElement('div')).render({
      label: this.messages?.testConnectionButton ?? '⚡ 测试连接',
      variant: 'primary',
      size: 'sm',
      iconName: 'Activity'
    });
    testButton.id = 'testConnectionBtn';
    testButton.dataset.state = 'idle';
    controls.append(testButton);

    return controls;
  }

  private buildConnectionResult(): HTMLElement {
    const body = this.createElement('div', 'space-y-3');
    body.id = 'connectionResult';
    body.hidden = true;
    body.setAttribute('aria-live', 'polite');
    this.connectionResultHost = body;

    // ✅ Stage 3 Week 3: Migrated connection result card to DaisyCard (RestSection)
    const cardHost = this.createElement('div', 'mt-2');
    const card = new DaisyCard(cardHost);
    card.render({
      title: this.messages?.testConnectionButton ?? '连接测试结果',
      body
    });
    return cardHost;
  }

  private renderConnectionTestResult(type: ConnectionResultType, text: string): void {
    if (!this.connectionResultHost) {
      return;
    }
    this.connectionResultHost.hidden = false;
    this.connectionResultHost.replaceChildren();
    const [message, ...rest] = text.split('\n');
    const description = rest.join('\n').trim() || undefined;
    // ✅ Stage 3 Week 3: Migrated connection result alert to DaisyAlert (RestSection)
    const alert = new DaisyAlert(this.connectionResultHost);
    alert.render({
      type: type === 'success' ? 'success' : type === 'error' ? 'error' : 'info',
      message: message || text,
      ...(description !== undefined && { description }),
      dismissible: type !== 'info'
    });
  }

  private resetConnectionTestResult(): void {
    if (!this.connectionResultHost) {
      return;
    }
    this.connectionResultHost.hidden = true;
    this.connectionResultHost.replaceChildren();
  }

  private renderAdditionalVaultRows(vaults: VaultConfig[], defaultVaultId?: string): void {
    if (!this.additionalRowsHost || !this.additionalEmptyHint) {
      return;
    }

    const additional = vaults.filter((vault) => vault.id !== (defaultVaultId ?? vaults[0]?.id));

    const existingRows = new Map<string, HTMLElement>();
    this.additionalRowsHost
      .querySelectorAll<HTMLElement>('[data-vault-id]')
      .forEach((row) => {
        if (row.dataset.vaultId) {
          existingRows.set(row.dataset.vaultId, row);
        }
      });

    const seen = new Set<string>();

    for (const vault of additional) {
      seen.add(vault.id);
      const existing = existingRows.get(vault.id);
      if (existing) {
        this.updateVaultRow(existing, vault);
      } else {
        this.additionalRowsHost.append(this.buildVaultRow(vault));
      }
    }

    for (const [id, row] of existingRows) {
      if (!seen.has(id)) {
        row.remove();
      }
    }

    this.additionalEmptyHint.hidden = this.additionalRowsHost.childElementCount > 0;
  }

  private buildVaultRow(vault: VaultConfig): HTMLElement {
    const row = this.createElement('div', 'grid grid-cols-[60px_140px_minmax(150px,1fr)_minmax(150px,1fr)_160px_80px] gap-2 p-3 items-center hover:bg-base-200 transition-colors');
    row.dataset.vaultId = vault.id;

    const enabledCell = document.createElement('label');
    enabledCell.className = 'flex items-center justify-center cursor-pointer';
    // ✅ Phase 1 DaisyUI migration: 使用 .checkbox 基类
    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.classList.add('rest-vault-enabled', 'checkbox', 'checkbox-accent', 'w-[18px]', 'h-[18px]');
    enabledCheckbox.checked = vault.enabled !== false;
    enabledCheckbox.addEventListener('change', () => {
      this.vaultRouterController.updateVault(vault.id, { enabled: enabledCheckbox.checked });
    });
    enabledCell.append(enabledCheckbox);
    row.append(enabledCell);

    row.append(
      this.buildVaultInputCell(
        vault.id,
        'name',
        vault.vault ?? '',
        this.messages?.vaultNamePlaceholder ?? 'AllInObsidian'
      )
    );
    row.append(
      this.buildVaultInputCell(vault.id, 'https', vault.httpsUrl ?? '', 'https://127.0.0.1:27124/')
    );
    row.append(
      this.buildVaultInputCell(vault.id, 'http', vault.httpUrl ?? '', 'http://127.0.0.1:27123/')
    );
    row.append(
      this.buildVaultInputCell(vault.id, 'api', vault.apiKey ?? '', '••••••••', 'password')
    );

    const actions = this.createElement('div', 'flex justify-end');
    const removeButtonHost = this.createElement('div');
    new DaisyButton(removeButtonHost).render({
      label: this.messages?.deleteVaultButton ?? '删除',
      variant: 'secondary',
      size: 'sm',
      iconName: 'Trash2',
      onClick: () => {
        this.vaultRouterController.removeVault(vault.id);
      }
    });
    actions.append(removeButtonHost);
    row.append(actions);

    return row;
  }

  private buildVaultInputCell(
    id: string,
    kind: 'https' | 'http' | 'name' | 'api',
    value: string,
    placeholder: string,
    type: 'text' | 'password' = 'text'
  ): HTMLElement {
    const host = this.createElement('div', 'w-full');
    const daisyInput = new DaisyInput(host);
    const input = daisyInput.render({
      type,
      placeholder,
      value,
      variant: 'bordered',
      size: 'sm',
      onChange: (nextValue) => {
        const updates: Partial<VaultConfig> = {};
        const trimmed = type === 'password' ? nextValue : nextValue.trim();

        if (kind === 'https') {
          updates.httpsUrl = trimmed;
        } else if (kind === 'http') {
          updates.httpUrl = trimmed;
        } else if (kind === 'name') {
          updates.vault = trimmed;
          updates.name = trimmed;
        } else {
          updates.apiKey = nextValue;
        }

        this.vaultRouterController.updateVault(id, updates);
      }
    });

    if (kind === 'https') {
      input.classList.add('rest-vault-https');
    } else if (kind === 'http') {
      input.classList.add('rest-vault-http');
    } else if (kind === 'name') {
      input.classList.add('rest-vault-name');
    } else {
      input.classList.add('rest-vault-api');
    }

    return host;
  }

  private updateVaultRow(row: HTMLElement, vault: VaultConfig): void {
    const toggle = row.querySelector<HTMLInputElement>('.rest-vault-enabled');
    if (toggle) {
      const checked = vault.enabled !== false;
      if (toggle.checked !== checked) {
        toggle.checked = checked;
      }
    }

    this.updateRowInput(row, '.rest-vault-name', vault.vault ?? '');
    this.updateRowInput(row, '.rest-vault-https', vault.httpsUrl ?? '');
    this.updateRowInput(row, '.rest-vault-http', vault.httpUrl ?? '');
    this.updateRowInput(row, '.rest-vault-api', vault.apiKey ?? '');
  }

  private updateRowInput(row: HTMLElement, selector: string, value: string): void {
    const input = row.querySelector<HTMLInputElement>(selector);
    if (!input) {
      return;
    }
    if (document.activeElement === input) {
      return;
    }
    if (input.value !== value) {
      input.value = value;
    }
  }

  private updateDefaultVaultField(
    field: 'name' | 'httpsUrl' | 'httpUrl' | 'apiKey',
    rawValue: string
  ): void {
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
    if (!this.isApplyingSnapshot) {
      markPendingAutoSave('rest');
    }
  }

  private registerFormIntegration(): void {
    const registry = this.requireFormRegistry();
    if (this.formSectionBinding) {
      registry.unregister('rest', this.formSectionBinding);
    }

    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };

    registry.register('rest', binding);
    this.formSectionBinding = binding;
  }

  private applySnapshot(options: StoredOptions | CompleteOptions): void {
    initializeVaultRouterStore(options.vaultRouter ?? null);
    const rest = (options.rest ?? {}) as Partial<RestOptions>;
    const router = getVaultRouterConfig();
    const defaultVault =
      router?.vaults.find(vault => vault.id === (router.defaultVaultId ?? this.defaultVaultId ?? '')) ??
      router?.vaults[0];

    const resolvedName = rest.vault ?? defaultVault?.vault ?? REST_DEFAULTS.vault;
    const resolvedHttps = rest.httpsUrl ?? defaultVault?.httpsUrl ?? '';
    const resolvedHttp = rest.httpUrl ?? defaultVault?.httpUrl ?? '';
    const resolvedApiKey = rest.apiKey ?? defaultVault?.apiKey ?? '';

    this.isApplyingSnapshot = true;
    if (this.defaultNameInput) {
      this.defaultNameInput.value = resolvedName;
    }
    if (this.defaultHttpsInput) {
      this.defaultHttpsInput.value = resolvedHttps;
    }
    if (this.defaultHttpInput) {
      this.defaultHttpInput.value = resolvedHttp;
    }
    if (this.defaultApiKeyInput) {
      this.defaultApiKeyInput.value = resolvedApiKey;
    }
    if (this.defaultVaultId) {
      this.updateDefaultVaultField('name', resolvedName);
      this.updateDefaultVaultField('httpsUrl', resolvedHttps);
      this.updateDefaultVaultField('httpUrl', resolvedHttp);
      this.updateDefaultVaultField('apiKey', resolvedApiKey);
    }
    this.isApplyingSnapshot = false;
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousRest = previous?.rest ?? null;

    const https = this.defaultHttpsInput?.value.trim() ?? '';
    const http = this.defaultHttpInput?.value.trim() ?? '';
    const vault = this.defaultNameInput?.value.trim() ?? '';
    const apiKey = this.defaultApiKeyInput?.value ?? '';

    const httpsUrl = https.length > 0 ? https : undefined;
    const httpUrl = http.length > 0 ? http : undefined;
    const resolvedVault = vault.length > 0 ? vault : REST_DEFAULTS.vault;
    const baseUrl = httpsUrl || httpUrl || REST_DEFAULTS.baseUrl;

    const partial: Partial<CompleteOptions> = {
      rest: {
        baseUrl,
        vault: resolvedVault,
        apiKey,
        ...(httpsUrl !== undefined && { httpsUrl }),
        ...(httpUrl !== undefined && { httpUrl }),
        ...(previousRest?.rootDir !== undefined && { rootDir: previousRest.rootDir })
      }
    };
    this.persistRest(partial);
    return partial;
  }

  private initializeConnectionTester(): void {
    this.connectionTester?.dispose();
    const button = this.container.querySelector<HTMLButtonElement>('#testConnectionBtn');
    const resultHost = this.container.querySelector<HTMLDivElement>('#connectionResult');
    if (!button || !resultHost) {
      this.connectionTester = null;
      return;
    }
    this.connectionTester = createConnectionTester({
      button,
      resultHost,
      getMessages: getOptionsMessages,
      getRestDraft: () => this.collectRestDraftForTest(),
      getAdditionalVaultConfigs: () => this.collectAdditionalVaultConfigsForTest(),
      renderResult: (_host, type, text) => this.renderConnectionTestResult(type, text),
      resetResult: () => this.resetConnectionTestResult(),
      runDefaultTest: (draft) => requestConnectionTest(draft, this.messagingRepo),
      runVaultTest: (vault) => requestVaultConnectionTest(vault, this.messagingRepo)
    });
  }

  private collectRestDraftForTest(): Partial<RestOptions> {
    const httpsInput = this.defaultHttpsInput?.value.trim() ?? '';
    const httpInput = this.defaultHttpInput?.value.trim() ?? '';
    const vaultInput = this.defaultNameInput?.value.trim() ?? '';
    const apiKeyInput = this.defaultApiKeyInput?.value ?? '';

    const draft: Partial<RestOptions> = {};
    if (httpsInput) {
      draft.httpsUrl = httpsInput;
    }
    if (httpInput) {
      draft.httpUrl = httpInput;
    }
    if (vaultInput) {
      draft.vault = vaultInput;
    }
    if (apiKeyInput) {
      draft.apiKey = apiKeyInput;
    }
    const baseCandidate = httpsInput || httpInput;
    if (baseCandidate) {
      draft.baseUrl = baseCandidate;
    }
    return draft;
  }

  private collectAdditionalVaultConfigsForTest(): VaultConfig[] {
    const snapshot = getVaultRouterConfig();
    const vaults = snapshot?.vaults ?? [];
    const defaultId = snapshot?.defaultVaultId ?? this.defaultVaultId ?? vaults[0]?.id ?? null;

    return vaults
      .filter((vault) => vault.id !== defaultId)
      .map((vault) => {
        const row = this.additionalRowsHost?.querySelector<HTMLElement>(`[data-vault-id="${vault.id}"]`);
        if (!row) {
          return vault;
        }

        const enabledToggle = row.querySelector<HTMLInputElement>('.rest-vault-enabled');
        const https = this.readRowValue(row, '.rest-vault-https');
        const http = this.readRowValue(row, '.rest-vault-http');
        const name = this.readRowValue(row, '.rest-vault-name');
        const apiKey = this.readRowValue(row, '.rest-vault-api', false);

        return {
          ...vault,
          ...(enabledToggle ? { enabled: enabledToggle.checked } : vault.enabled !== undefined ? { enabled: vault.enabled } : {}),
          ...(https !== null ? { httpsUrl: https } : vault.httpsUrl !== undefined ? { httpsUrl: vault.httpsUrl } : {}),
          ...(http !== null ? { httpUrl: http } : vault.httpUrl !== undefined ? { httpUrl: vault.httpUrl } : {}),
          vault: name ?? vault.vault,
          name: name ?? vault.name,
          apiKey: apiKey ?? vault.apiKey
        };
      })
      .filter((vault) => vault.enabled !== false);
  }

  private readRowValue(row: HTMLElement, selector: string, trim = true): string | null {
    const input = row.querySelector<HTMLInputElement>(selector);
    if (!input) {
      return null;
    }
    const value = input.value ?? '';
    return trim ? value.trim() : value;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }

  private persistRest(partial: Partial<CompleteOptions>): void {
    void this.optionsRepo
      .set(partial)
      .catch((error) => {
        console.error('[RestSection] Failed to persist REST options via repository:', error);
      });
  }
}
