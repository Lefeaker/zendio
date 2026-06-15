import type { UserVisibleMessageDescriptor } from '../i18n/userVisibleMessageDescriptor';

export type ConnectionChannel = 'localFolder' | 'https' | 'http';

export interface ConnectionChannelResult {
  channel: ConnectionChannel;
  label: string;
  labelDescriptor?: UserVisibleMessageDescriptor;
  configured: boolean;
  success: boolean;
  message: string;
  messageDescriptor?: UserVisibleMessageDescriptor;
  url?: string;
  status?: number;
  response?: string;
  error?: string;
  errorDescriptor?: UserVisibleMessageDescriptor;
  certificateUrl?: string;
}

export interface VaultConnectionTestResult {
  vaultId: string;
  vaultName: string;
  success: boolean;
  message: string;
  messageDescriptor?: UserVisibleMessageDescriptor;
  error?: string;
  errorDescriptor?: UserVisibleMessageDescriptor;
  channels: ConnectionChannelResult[];
}

export interface ConnectionTestResult {
  [key: string]:
    | string
    | number
    | boolean
    | undefined
    | UserVisibleMessageDescriptor
    | ConnectionChannelResult[]
    | VaultConnectionTestResult[];
  success: boolean;
  status?: number;
  message: string;
  messageDescriptor?: UserVisibleMessageDescriptor;
  response?: string;
  error?: string;
  errorDescriptor?: UserVisibleMessageDescriptor;
  channels?: ConnectionChannelResult[];
  vaults?: VaultConnectionTestResult[];
}
