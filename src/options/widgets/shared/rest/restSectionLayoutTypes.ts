export interface RestSectionMessagesLike {
  apiConfigTitle?: string;
  apiConfigHint?: string;
  additionalVaultsHint?: string;
  ruleEnabledLabel?: string;
  vaultNameLabel?: string;
  httpsUrlLabel?: string;
  httpUrlLabel?: string;
  apiKeyLabel?: string;
  defaultVaultBadge?: string;
  vaultNamePlaceholder?: string;
  addVaultButton?: string;
  testConnectionButton?: string;
  deleteVaultButton?: string;
}

export interface RestDefaultVaultInputRefs {
  defaultNameInput: HTMLInputElement | null;
  defaultHttpsInput: HTMLInputElement | null;
  defaultHttpInput: HTMLInputElement | null;
  defaultApiKeyInput: HTMLInputElement | null;
}

export interface RestSectionLayoutRefs extends RestDefaultVaultInputRefs {
  additionalRowsHost: HTMLElement;
  additionalEmptyHint: HTMLElement;
  connectionResultHost: HTMLDivElement;
}
