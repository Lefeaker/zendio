export interface DynamicMessageTemplates {
  httpsUrlHint: string;
  httpUrlHint: string;
  vaultNamePlaceholder: string;
}

export type DynamicMessageKey = keyof DynamicMessageTemplates;
