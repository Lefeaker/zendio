export interface ConnectionTestConfig {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  apiKey: string;
  vault: string;
  label?: string;
  localFolderId?: string;
  localFolderName?: string;
}
