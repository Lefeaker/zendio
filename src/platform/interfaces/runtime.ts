export type RuntimeEventUnsubscribe = () => void;

export interface RuntimeInstallDetails {
  reason?: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
  previousVersion?: string;
}

export type RuntimeInstallListener = (details: RuntimeInstallDetails) => void;
export type RuntimeStartupListener = () => void;
export type RuntimeMessageSender = <TResult = unknown>(message: unknown) => Promise<TResult>;
export type RuntimeLanguageProvider = () => string | undefined;
export type BrowserTarget = 'chrome' | 'firefox';

export interface RuntimeService {
  getURL: (path: string) => string;
  getBrowserTarget: () => BrowserTarget;
  openOptionsPage: () => Promise<void>;
  sendMessage?: RuntimeMessageSender;
  getUILanguage?: RuntimeLanguageProvider;
  getManifest?: () => { version?: string } | undefined;
  onInstalled: (listener: RuntimeInstallListener) => RuntimeEventUnsubscribe;
  onStartup: (listener: RuntimeStartupListener) => RuntimeEventUnsubscribe;
}
