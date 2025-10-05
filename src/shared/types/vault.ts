export type VaultConfig = {
  id: string;
  name: string;
  httpsUrl: string;
  httpUrl: string;
  vault: string;
  apiKey: string;
  isDefault?: boolean;
};

export type RoutingRuleType = 'domain' | 'keyword' | 'url-pattern';

export type RoutingRule = {
  id: string;
  vaultId: string;
  type: RoutingRuleType;
  pattern: string;
  enabled: boolean;
  priority: number;
  description?: string;
};

export type VaultRouterConfig = {
  vaults: VaultConfig[];
  rules: RoutingRule[];
  defaultVaultId?: string;
};

export interface ClipContext {
  url: string;
  domain: string;
  title: string;
  content: string;
  type: 'article' | 'ai_chat';
}
