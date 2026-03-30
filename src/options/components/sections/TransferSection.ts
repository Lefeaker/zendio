import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import type { IOptionsRepository } from '@shared/repositories';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';
import { createOptionsButtonElement as createDaisyButtonElement } from '../../../ui/primitives/button';
import { UiAlert as DaisyAlert } from '../../../ui/primitives/alert';
import {
  copyConfig as copyConfigAction,
  importConfig as importConfigAction
} from '../../app/optionsActions';

interface TransferLogSnapshot {
  transferLog?: {
    lastAction: 'copy' | 'import';
    timestamp: number;
  };
}

export class TransferSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private copyButton: HTMLButtonElement | null = null;
  private importButton: HTMLButtonElement | null = null;
  private messageArea: HTMLElement | null = null;
  private messageHideTimer: ReturnType<typeof setTimeout> | null = null;
  private isCopying = false;
  private isImporting = false;
  private repoUnsubscribe: (() => void) | null = null;
  private cachedTransferLog: TransferLogSnapshot['transferLog'] | null = null;

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(): HTMLElement {
    this.applySectionChrome();
    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.copyButton?.removeEventListener('click', this.handleCopy);
    this.importButton?.removeEventListener('click', this.handleImport);
    this.copyButton = null;
    this.importButton = null;
    this.messageArea = null;
    if (this.messageHideTimer) {
      clearTimeout(this.messageHideTimer);
      this.messageHideTimer = null;
    }
    this.repoUnsubscribe?.();
    this.repoUnsubscribe = null;
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.configTransferTitle ?? '配置同步',
      description: this.messages?.configTransferHint ?? '在不同浏览器之间复制配置，快速完成同步',
      titleClassName: 'm-0 text-2xl font-semibold tracking-tight',
      descriptionClassName: 'text-base-content/60 text-md'
    });
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createSectionBody();

    wrapper.append(this.buildActionRow());
    wrapper.append(this.buildMessageArea());

    return wrapper;
  }

  private buildActionRow(): HTMLElement {
    const actionRow = this.createElement('div', 'flex flex-wrap gap-3 items-center mt-4');

    const copyButton = createDaisyButtonElement({
      label: this.messages?.copyConfigButton ?? '复制配置',
      variant: 'primary',
      id: 'copyConfigBtn'
    });
    copyButton.addEventListener('click', this.handleCopy);

    const importButton = createDaisyButtonElement({
      label: this.messages?.importConfigButton ?? '导入并保存',
      variant: 'outline',
      id: 'importConfigBtn'
    });
    importButton.addEventListener('click', this.handleImport);

    this.copyButton = copyButton;
    this.importButton = importButton;

    actionRow.append(copyButton, importButton);
    return actionRow;
  }

  private buildMessageArea(): HTMLElement {
    const messageArea = this.createElement('div', 'my-3 w-full');
    messageArea.id = 'transferMessage';
    messageArea.hidden = true;
    this.messageArea = messageArea;
    return messageArea;
  }

  private showMessage(text: string, isError = false, options: { persist?: boolean } = {}): void {
    if (!this.messageArea) {
      return;
    }
    this.messageArea.hidden = false;
    const alert = new DaisyAlert(this.messageArea);
    // ✅ Stage 3 Week 2: Migrated transfer status to DaisyAlert
    alert.render({
      type: isError ? 'error' : 'success',
      message: text,
      dismissible: true,
      onDismiss: () => {
        if (this.messageArea) {
          this.messageArea.hidden = true;
          this.messageArea.replaceChildren();
        }
      }
    });

    if (this.messageHideTimer) {
      clearTimeout(this.messageHideTimer);
    }
    if (options.persist) {
      this.messageHideTimer = null;
      return;
    }
    this.messageHideTimer = setTimeout(() => {
      if (this.messageArea) {
        this.messageArea.hidden = true;
        this.messageArea.replaceChildren();
      }
      this.messageHideTimer = null;
    }, 5000);
  }

  private handleCopy = (): void => {
    if (this.isCopying || !this.copyButton) {
      return;
    }

    this.isCopying = true;
    this.copyButton.disabled = true;
    this.copyButton.setAttribute('aria-busy', 'true');

    void copyConfigAction()
      .then(() => {
        this.persistTransferLog('copy');
        this.showMessage(this.messages?.copyConfigSuccess ?? '配置已复制到剪贴板！');
      })
      .catch((error) => {
        this.showMessage(`Copy failed: ${String(error)}`, true);
      })
      .finally(() => {
        if (this.copyButton) {
          this.copyButton.disabled = false;
          this.copyButton.removeAttribute('aria-busy');
        }
        this.isCopying = false;
      });
  };

  private handleImport = (): void => {
    if (this.isImporting || !this.importButton) {
      return;
    }

    this.isImporting = true;
    this.importButton.disabled = true;
    this.importButton.setAttribute('aria-busy', 'true');

    void importConfigAction()
      .then(() => {
        this.persistTransferLog('import');
        this.showMessage(this.messages?.importSuccess ?? '配置已成功导入！');
      })
      .catch((error) => {
        this.showMessage(`Import failed: ${String(error)}`, true);
      })
      .finally(() => {
        if (this.importButton) {
          this.importButton.disabled = false;
          this.importButton.removeAttribute('aria-busy');
        }
        this.isImporting = false;
      });
  };

  private subscribeToRepository(): void {
    this.repoUnsubscribe?.();
    this.repoUnsubscribe = this.optionsRepo.onChange((options) => {
      const snapshot = (options as Partial<TransferLogSnapshot>).transferLog ?? null;
      this.cachedTransferLog = snapshot;
      if (snapshot) {
        this.showHistoryMessage(snapshot);
      }
    });
  }

  private showHistoryMessage(log: NonNullable<TransferLogSnapshot['transferLog']>): void {
    const date = new Date(log.timestamp).toLocaleString();
    const text =
      log.lastAction === 'copy'
        ? (this.messages?.copyConfigSuccess ?? '配置已复制到剪贴板！')
        : (this.messages?.importSuccess ?? '配置已成功导入！');
    this.showMessage(`${text} (${date})`, false, { persist: true });
  }

  private persistTransferLog(lastAction: 'copy' | 'import'): void {
    const entry = { lastAction, timestamp: Date.now() };
    this.cachedTransferLog = entry;
    void this.optionsRepo
      .set({
        transferLog: entry
      })
      .catch((error) => {
        console.error('[TransferSection] Failed to persist transfer log via repository:', error);
      });
  }
}
