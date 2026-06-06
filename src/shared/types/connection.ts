export type ConnectionChannel = 'localFolder' | 'https' | 'http';

export interface ConnectionChannelResult {
  channel: ConnectionChannel;
  label: string;
  configured: boolean;
  success: boolean;
  message: string;
  url?: string;
  status?: number;
  response?: string;
  error?: string;
  certificateUrl?: string;
}

export interface VaultConnectionTestResult {
  vaultId: string;
  vaultName: string;
  success: boolean;
  message: string;
  error?: string;
  channels: ConnectionChannelResult[];
}

export interface ConnectionTestResult {
  [key: string]:
    | string
    | number
    | boolean
    | undefined
    | ConnectionChannelResult[]
    | VaultConnectionTestResult[];
  success: boolean;
  status?: number;
  message: string;
  response?: string;
  error?: string;
  channels?: ConnectionChannelResult[];
  vaults?: VaultConnectionTestResult[];
}
