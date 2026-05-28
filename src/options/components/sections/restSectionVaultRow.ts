import type { VaultConfig } from '@shared/types/vault';
import { UiButton as DaisyButton } from '@ui/primitives/button';
import { UiInput as DaisyInput } from '@ui/primitives/input';
import { UiCheckbox as DaisyCheckbox } from '@ui/primitives/checkbox';
import { configProvider } from '@shared/config';
import type { RestSectionMessagesLike } from './restSectionLayoutTypes';

export function buildRestVaultRow(params: {
  createElement: typeof document.createElement;
  messages: RestSectionMessagesLike | null;
  vault: VaultConfig;
  updateVault: (vaultId: string, updates: Partial<VaultConfig>) => void;
  removeVault: (vaultId: string) => void;
  chooseLocalFolder: (vault: VaultConfig) => void;
  clearLocalFolder: (vault: VaultConfig) => void;
}): HTMLElement {
  const {
    createElement,
    messages,
    vault,
    updateVault,
    removeVault,
    chooseLocalFolder,
    clearLocalFolder
  } = params;
  const row = createElement('div');
  row.className =
    'grid grid-cols-[60px_140px_170px_minmax(150px,1fr)_minmax(150px,1fr)_160px_80px] gap-2 p-3 items-center hover:bg-base-200 transition-colors';
  row.dataset.vaultId = vault.id;
  const restDefaults = configProvider.getRestDefaults();

  const enabledCell = createElement('div');
  enabledCell.className = 'flex items-center justify-center';
  const enabledCheckboxHost = createElement('div');
  const enabledCheckbox = new DaisyCheckbox(enabledCheckboxHost).render({
    checked: vault.enabled !== false,
    ariaLabel: messages?.ruleEnabledLabel ?? '启用',
    labelClassName: 'justify-center',
    inputClassName: 'rest-vault-enabled'
  });
  enabledCheckbox.checked = vault.enabled !== false;
  enabledCheckbox.addEventListener('change', () => {
    updateVault(vault.id, { enabled: enabledCheckbox.checked });
  });
  enabledCell.append(enabledCheckboxHost);
  row.append(enabledCell);

  row.append(
    buildVaultInputCell(
      createElement,
      vault.id,
      'name',
      vault.vault ?? '',
      messages?.vaultNamePlaceholder ?? 'AllInObsidian',
      updateVault
    )
  );
  row.append(
    buildLocalFolderCell({
      createElement,
      messages,
      vault,
      onChoose: () => chooseLocalFolder(vault),
      onClear: () => clearLocalFolder(vault)
    })
  );
  row.append(
    buildVaultInputCell(
      createElement,
      vault.id,
      'https',
      vault.httpsUrl ?? '',
      restDefaults.httpsUrl,
      updateVault
    )
  );
  row.append(
    buildVaultInputCell(
      createElement,
      vault.id,
      'http',
      vault.httpUrl ?? '',
      restDefaults.httpUrl,
      updateVault
    )
  );
  row.append(
    buildVaultInputCell(
      createElement,
      vault.id,
      'api',
      vault.apiKey ?? '',
      '••••••••',
      updateVault,
      'password'
    )
  );

  const actions = createElement('div');
  actions.className = 'flex justify-end';
  const removeButtonHost = createElement('div');
  new DaisyButton(removeButtonHost).render({
    label: messages?.deleteVaultButton ?? '删除',
    variant: 'secondary',
    size: 'sm',
    iconName: 'Trash2',
    onClick: () => removeVault(vault.id)
  });
  actions.append(removeButtonHost);
  row.append(actions);

  return row;
}

export function updateRestVaultRow(row: HTMLElement, vault: VaultConfig): void {
  const toggle = row.querySelector<HTMLInputElement>('.rest-vault-enabled');
  if (toggle) {
    const checked = vault.enabled !== false;
    if (toggle.checked !== checked) {
      toggle.checked = checked;
    }
  }

  updateRestRowInput(row, '.rest-vault-name', vault.vault ?? '');
  updateLocalFolderButton(row, vault.localFolderId, vault.localFolderName);
  updateRestRowInput(row, '.rest-vault-https', vault.httpsUrl ?? '');
  updateRestRowInput(row, '.rest-vault-http', vault.httpUrl ?? '');
  updateRestRowInput(row, '.rest-vault-api', vault.apiKey ?? '');
}

function buildLocalFolderCell(args: {
  createElement: typeof document.createElement;
  messages: RestSectionMessagesLike | null;
  vault: VaultConfig;
  onChoose: () => void;
  onClear: () => void;
}): HTMLElement {
  const { createElement, messages, vault, onChoose, onClear } = args;
  const host = createElement('div');
  host.className = 'flex min-w-0 items-center gap-2';

  const chooseHost = createElement('div');
  chooseHost.className = 'min-w-0 flex-1';
  const chooseButton = new DaisyButton(chooseHost).render({
    label: vault.localFolderName || messages?.chooseLocalFolderButton || '选择目录',
    variant: 'secondary',
    size: 'sm',
    iconName: 'FolderOpen',
    onClick: onChoose
  });
  chooseButton.classList.add('rest-vault-local-folder', 'max-w-full', 'truncate');
  chooseButton.dataset.localFolderId = vault.localFolderId ?? '';
  chooseButton.dataset.localFolderName = vault.localFolderName ?? '';
  host.append(chooseHost);

  const clearHost = createElement('div');
  const clearButton = new DaisyButton(clearHost).render({
    label: messages?.clearLocalFolderButton ?? '清除',
    variant: 'secondary',
    size: 'sm',
    iconName: 'X',
    onClick: onClear
  });
  clearButton.classList.add('rest-vault-local-folder-clear');
  clearButton.hidden = !vault.localFolderId;
  host.append(clearHost);

  return host;
}

function updateLocalFolderButton(
  row: HTMLElement,
  localFolderId: string | undefined,
  localFolderName: string | undefined
): void {
  const button = row.querySelector<HTMLButtonElement>('.rest-vault-local-folder');
  if (button) {
    button.dataset.localFolderId = localFolderId ?? '';
    button.dataset.localFolderName = localFolderName ?? '';
    button.textContent = localFolderName || '选择目录';
  }
  const clearButton = row.querySelector<HTMLButtonElement>('.rest-vault-local-folder-clear');
  if (clearButton) {
    clearButton.hidden = !localFolderId;
  }
}

export function renderRestVaultRows(params: {
  additionalRowsHost: HTMLElement | null;
  additionalEmptyHint: HTMLElement | null;
  vaults: VaultConfig[];
  defaultVaultId?: string;
  createRow: (vault: VaultConfig) => HTMLElement;
}): void {
  const { additionalRowsHost, additionalEmptyHint, vaults, defaultVaultId, createRow } = params;
  if (!additionalRowsHost || !additionalEmptyHint) {
    return;
  }

  const additional = vaults.filter((vault) => vault.id !== (defaultVaultId ?? vaults[0]?.id));

  const existingRows = new Map<string, HTMLElement>();
  additionalRowsHost.querySelectorAll<HTMLElement>('[data-vault-id]').forEach((row) => {
    if (row.dataset.vaultId) {
      existingRows.set(row.dataset.vaultId, row);
    }
  });

  const seen = new Set<string>();

  for (const vault of additional) {
    seen.add(vault.id);
    const existing = existingRows.get(vault.id);
    if (existing) {
      updateRestVaultRow(existing, vault);
    } else {
      additionalRowsHost.append(createRow(vault));
    }
  }

  for (const [id, row] of existingRows) {
    if (!seen.has(id)) {
      row.remove();
    }
  }

  additionalEmptyHint.hidden = additionalRowsHost.childElementCount > 0;
}

function buildVaultInputCell(
  createElement: typeof document.createElement,
  vaultId: string,
  kind: 'https' | 'http' | 'name' | 'api',
  value: string,
  placeholder: string,
  updateVault: (vaultId: string, updates: Partial<VaultConfig>) => void,
  type: 'text' | 'password' = 'text'
): HTMLElement {
  const host = createElement('div');
  host.className = 'w-full';
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

      updateVault(vaultId, updates);
    }
  });

  input.classList.add(
    kind === 'https'
      ? 'rest-vault-https'
      : kind === 'http'
        ? 'rest-vault-http'
        : kind === 'name'
          ? 'rest-vault-name'
          : 'rest-vault-api'
  );

  return host;
}

function updateRestRowInput(row: HTMLElement, selector: string, value: string): void {
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
