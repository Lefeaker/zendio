import type { StorageService } from '@platform/interfaces/storage';

export const GA4_CONFIG = {
  MEASUREMENT_ID: 'G-XXXXXXXXXX',
  EVENT_NAMES: {
    ERROR: 'extension_error',
    USAGE: 'extension_usage',
    PERFORMANCE: 'extension_performance'
  },
  CUSTOM_PARAMS: {
    ERROR_CODE: 'error_code',
    ERROR_DOMAIN: 'error_domain',
    ERROR_CATEGORY: 'error_category',
    ERROR_SEVERITY: 'error_severity',
    ERROR_SEVERITY_LEVEL: 'error_severity_level',
    ERROR_RECOVERABLE: 'error_recoverable',
    ERROR_DESCRIPTION: 'error_description',
    EXTENSION_VERSION: 'extension_version',
    BROWSER_NAME: 'browser_name',
    BROWSER_VERSION: 'browser_version',
    SESSION_ID: 'session_id'
  },
  STORAGE_KEYS: {
    USER_CONSENT: 'analytics_user_consent',
    CLIENT_ID: 'analytics_client_id',
    SESSION_ID: 'analytics_session_id',
    CONFIG: 'analytics_config',
    LAST_REPORT_TIME: 'analytics_last_report_time'
  }
} as const;

export interface UserConsent {
  analytics: boolean;
  errorReporting: boolean;
  timestamp: number;
  version: string;
}

export interface AnalyticsConfig {
  enabled: boolean;
  debugMode: boolean;
  measurementId: string;
  clientId?: string;
  sessionId?: string;
  userConsent?: UserConsent;
  reportingInterval: number;
  maxErrorsPerSession: number;
  batchSize: number;
}

export interface AnalyticsDebugInfo {
  enabled: boolean;
  hasConsent: boolean;
  clientId?: string;
  sessionId?: string;
  measurementId: string;
  debugMode: boolean;
  consentTimestamp?: number;
  consentVersion?: string;
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false,
  debugMode: false,
  measurementId: GA4_CONFIG.MEASUREMENT_ID,
  reportingInterval: 30000,
  maxErrorsPerSession: 50,
  batchSize: 10
};

export class AnalyticsConfigManager {
  private config: AnalyticsConfig;

  constructor(
    private readonly storage: StorageService,
    initialConfig?: Partial<AnalyticsConfig>
  ) {
    this.config = { ...DEFAULT_ANALYTICS_CONFIG, ...initialConfig };
  }

  async initialize(): Promise<void> {
    try {
      const storedConfig = await this.storage.local.get<Partial<AnalyticsConfig>>(
        GA4_CONFIG.STORAGE_KEYS.CONFIG
      );

      if (storedConfig) {
        this.config = { ...this.config, ...storedConfig };
      }

      const userConsent = await this.getUserConsent();
      if (userConsent) {
        this.config.userConsent = userConsent;
        this.config.enabled = userConsent.analytics && userConsent.errorReporting;
      }

      let clientId = await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID);
      if (!clientId) {
        clientId = this.generateClientId();
        await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID, clientId);
      }
      this.config.clientId = clientId;

      this.config.sessionId = this.generateSessionId();
      await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.SESSION_ID, this.config.sessionId);
    } catch (error) {
      console.warn('[Analytics Config] Failed to initialize:', error);
      this.config = { ...DEFAULT_ANALYTICS_CONFIG };
    }
  }

  getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<AnalyticsConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CONFIG, this.config);
  }

  async setUserConsent(consent: Omit<UserConsent, 'timestamp' | 'version'>): Promise<void> {
    const userConsent: UserConsent = {
      ...consent,
      timestamp: Date.now(),
      version: '1.0'
    };

    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.USER_CONSENT, userConsent);

    this.config.userConsent = userConsent;
    this.config.enabled = userConsent.analytics && userConsent.errorReporting;

    await this.updateConfig({ enabled: this.config.enabled });
  }

  async getUserConsent(): Promise<UserConsent | null> {
    try {
      return (
        (await this.storage.local.get<UserConsent>(GA4_CONFIG.STORAGE_KEYS.USER_CONSENT)) ?? null
      );
    } catch {
      return null;
    }
  }

  hasUserConsent(): boolean {
    return (
      this.config.userConsent?.analytics === true &&
      this.config.userConsent?.errorReporting === true
    );
  }

  isErrorReportingEnabled(): boolean {
    return this.config.enabled && this.hasUserConsent();
  }

  async renewSession(): Promise<void> {
    this.config.sessionId = this.generateSessionId();
    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.SESSION_ID, this.config.sessionId);
  }

  async refreshFromStorage(): Promise<void> {
    try {
      const storedConfig = await this.storage.local.get<Partial<AnalyticsConfig>>(
        GA4_CONFIG.STORAGE_KEYS.CONFIG
      );
      if (storedConfig) {
        this.config = { ...this.config, ...storedConfig };
      }
    } catch (error) {
      console.warn('[Analytics Config] Failed to refresh config:', error);
    }
  }

  async clearAllData(): Promise<void> {
    const keys = Object.values(GA4_CONFIG.STORAGE_KEYS);
    await Promise.all(keys.map((key) => this.storage.local.remove(key)));

    this.config = { ...DEFAULT_ANALYTICS_CONFIG };
  }

  getDebugInfo(): AnalyticsDebugInfo {
    const clientIdPreview = this.config.clientId
      ? `${this.config.clientId.substring(0, 10)}...`
      : undefined;
    const sessionIdPreview = this.config.sessionId
      ? `${this.config.sessionId.substring(0, 10)}...`
      : undefined;

    return {
      enabled: this.config.enabled,
      hasConsent: this.hasUserConsent(),
      measurementId: this.config.measurementId,
      debugMode: this.config.debugMode,
      ...(clientIdPreview !== undefined && { clientId: clientIdPreview }),
      ...(sessionIdPreview !== undefined && { sessionId: sessionIdPreview }),
      ...(this.config.userConsent?.timestamp !== undefined && {
        consentTimestamp: this.config.userConsent.timestamp
      }),
      ...(this.config.userConsent?.version !== undefined && {
        consentVersion: this.config.userConsent.version
      })
    };
  }

  private generateClientId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 11);
    return `ext-${timestamp}-${random}`;
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `${timestamp}-${random}`;
  }
}

let configManagerInstance: AnalyticsConfigManager | null = null;
let analyticsStorage: StorageService | null = null;

export function configureAnalyticsConfigManager(storage: StorageService): AnalyticsConfigManager {
  analyticsStorage = storage;
  if (!configManagerInstance) {
    configManagerInstance = new AnalyticsConfigManager(storage);
  }

  return configManagerInstance;
}

export function getAnalyticsConfigManager(): AnalyticsConfigManager {
  if (!configManagerInstance) {
    if (!analyticsStorage) {
      throw new Error('[Analytics Config] StorageService is not configured.');
    }
    configManagerInstance = new AnalyticsConfigManager(analyticsStorage);
  }
  return configManagerInstance;
}

export async function initializeAnalyticsConfig(): Promise<AnalyticsConfig> {
  const manager = getAnalyticsConfigManager();
  await manager.initialize();
  return manager.getConfig();
}

export function shouldReportErrors(): boolean {
  const manager = getAnalyticsConfigManager();
  return manager.isErrorReportingEnabled();
}

export async function setAnalyticsConsent(
  analytics: boolean,
  errorReporting: boolean
): Promise<void> {
  const manager = getAnalyticsConfigManager();
  await manager.setUserConsent({ analytics, errorReporting });
}
