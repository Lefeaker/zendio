export type RuntimeEventUnsubscribe = () => void;

export interface RuntimeInstallDetails {
  reason?: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
  previousVersion?: string;
}

export type RuntimeInstallListener = (details: RuntimeInstallDetails) => void;
export type RuntimeStartupListener = () => void;
export type RuntimeMessageSender = <TResult = unknown>(message: unknown) => Promise<TResult>;
export type RuntimeLanguageProvider = () => string | undefined;

export interface RuntimeService {
  getURL: (path: string) => string;
  openOptionsPage: () => Promise<void>;
  sendMessage?: RuntimeMessageSender;
  getUILanguage?: RuntimeLanguageProvider;
  getManifest?: () => { version?: string } | undefined;
  onInstalled: (listener: RuntimeInstallListener) => RuntimeEventUnsubscribe;
  onStartup: (listener: RuntimeStartupListener) => RuntimeEventUnsubscribe;
}
