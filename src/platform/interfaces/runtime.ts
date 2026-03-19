export type RuntimeEventUnsubscribe = () => void;

export interface RuntimeInstallDetails {
  reason?: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
  previousVersion?: string;
}

export type RuntimeInstallListener = (details: RuntimeInstallDetails) => void;
export type RuntimeStartupListener = () => void;

export interface RuntimeService {
  getURL(path: string): string;
  openOptionsPage(): Promise<void>;
  getManifest?(): { version?: string } | undefined;
  onInstalled(listener: RuntimeInstallListener): RuntimeEventUnsubscribe;
  onStartup(listener: RuntimeStartupListener): RuntimeEventUnsubscribe;
}
