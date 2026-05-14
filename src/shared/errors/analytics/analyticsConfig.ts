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
    ERROR_SEVERITY: 'error_severity',
    EXTENSION_VERSION: 'extension_version',
    BROWSER_VERSION: 'browser_version',
    ERROR_CONTEXT: 'error_context',
    USER_AGENT_HASH: 'user_agent_hash',
    SESSION_DURATION: 'session_duration',
    FEATURE_USED: 'feature_used',
    PERFORMANCE_METRIC: 'performance_metric'
  },
  STORAGE_KEYS: {
    USER_CONSENT: 'analytics_user_consent',
    CONFIG: 'analytics_config',
    CLIENT_ID: 'analytics_client_id',
    SESSION_ID: 'analytics_session_id',
    ERROR_QUEUE: 'analytics_error_queue',
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

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false,
  debugMode: false,
  measurementId: GA4_CONFIG.MEASUREMENT_ID,
  reportingInterval: 30000,
  maxErrorsPerSession: 50,
  batchSize: 10
};

export class AnalyticsConfigManager {
  private config: AnalyticsConfig = { ...DEFAULT_ANALYTICS_CONFIG };

  constructor(private readonly storage: StorageService) {}

  async initialize(): Promise<void> {
    await this.refreshFromStorage();
    await this.ensureClientId();
    await this.renewSession();
  }

  async refreshFromStorage(): Promise<void> {
    const storedConfig = await this.storage.local.get<Partial<AnalyticsConfig>>(
      GA4_CONFIG.STORAGE_KEYS.CONFIG
    );
    const storedConsent = await this.storage.local.get<UserConsent>(
      GA4_CONFIG.STORAGE_KEYS.USER_CONSENT
    );
    const storedClientId = await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID);
    const storedSessionId = await this.storage.local.get<string>(
      GA4_CONFIG.STORAGE_KEYS.SESSION_ID
    );

    this.config = {
      ...DEFAULT_ANALYTICS_CONFIG,
      ...(storedConfig ?? {})
    };

    if (storedClientId) {
      this.config.clientId = storedClientId;
    }
    if (storedSessionId) {
      this.config.sessionId = storedSessionId;
    }
    if (storedConsent) {
      this.config.userConsent = storedConsent;
    }

    this.config.enabled = Boolean(storedConsent?.analytics || storedConsent?.errorReporting);
  }

  getConfig(): AnalyticsConfig {
    return {
      ...this.config,
      ...(this.config.userConsent ? { userConsent: { ...this.config.userConsent } } : {})
    };
  }

  async updateConfig(updates: Partial<AnalyticsConfig>): Promise<void> {
    this.config = {
      ...this.config,
      ...updates
    };
    await this.saveConfig();
  }

  async setUserConsent(consent: Omit<UserConsent, 'timestamp' | 'version'>): Promise<void> {
    const nextConsent: UserConsent = {
      analytics: consent.analytics,
      errorReporting: consent.errorReporting,
      timestamp: Date.now(),
      version: '1.0'
    };

    this.config.userConsent = nextConsent;
    this.config.enabled = nextConsent.analytics || nextConsent.errorReporting;

    await Promise.all([
      this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.USER_CONSENT, nextConsent),
      this.saveConfig()
    ]);
  }

  async getUserConsent(): Promise<UserConsent | undefined> {
    const consent = this.config.userConsent;
    return consent ? { ...consent } : undefined;
  }

  async renewSession(): Promise<void> {
    const sessionId = this.generateSessionId();
    this.config.sessionId = sessionId;
    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);
  }

  hasUserConsent(): boolean {
    return Boolean(this.config.userConsent?.analytics || this.config.userConsent?.errorReporting);
  }

  hasAnalyticsConsent(): boolean {
    return Boolean(this.config.userConsent?.analytics);
  }

  hasErrorReportingConsent(): boolean {
    return Boolean(this.config.userConsent?.errorReporting);
  }

  getStatus(): {
    enabled: boolean;
    hasConsent: boolean;
    clientId?: string;
    sessionId?: string;
    measurementId: string;
    debugMode: boolean;
    reportingInterval: number;
    maxErrorsPerSession: number;
  } {
    return {
      enabled: this.config.enabled,
      hasConsent: this.hasUserConsent(),
      ...(this.config.clientId ? { clientId: `${this.config.clientId.slice(0, 10)}...` } : {}),
      ...(this.config.sessionId ? { sessionId: `${this.config.sessionId.slice(0, 10)}...` } : {}),
      measurementId: this.config.measurementId,
      debugMode: this.config.debugMode,
      reportingInterval: this.config.reportingInterval,
      maxErrorsPerSession: this.config.maxErrorsPerSession
    };
  }

  async clearAllData(): Promise<void> {
    const keys = Object.values(GA4_CONFIG.STORAGE_KEYS);
    await Promise.all(keys.map((key) => this.storage.local.remove(key)));
    this.config = { ...DEFAULT_ANALYTICS_CONFIG };
  }

  private async ensureClientId(): Promise<void> {
    const existingClientId =
      this.config.clientId ??
      (await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID));
    const clientId = existingClientId ?? this.generateClientId();

    this.config.clientId = clientId;
    if (!existingClientId) {
      await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID, clientId);
    }
  }

  private async saveConfig(): Promise<void> {
    await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CONFIG, this.config);
  }

  private generateClientId(): string {
    return `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateSessionId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

let configManager: AnalyticsConfigManager | null = null;
let analyticsStorage: StorageService | null = null;

export function configureAnalyticsConfigManager(storage: StorageService): AnalyticsConfigManager {
  analyticsStorage = storage;
  if (!configManager) {
    configManager = new AnalyticsConfigManager(storage);
  }
  return configManager;
}

export function getAnalyticsConfigManager(): AnalyticsConfigManager {
  if (!configManager) {
    if (!analyticsStorage) {
      throw new Error('[Analytics Config] StorageService is not configured.');
    }
    configManager = new AnalyticsConfigManager(analyticsStorage);
  }
  return configManager;
}

export async function initializeAnalyticsConfig(): Promise<AnalyticsConfig> {
  const manager = getAnalyticsConfigManager();
  await manager.initialize();
  return manager.getConfig();
}

export function shouldReportErrors(): boolean {
  const config = getAnalyticsConfigManager().getConfig();
  return Boolean(config.enabled && config.userConsent?.errorReporting);
}

export async function setAnalyticsConsent(
  analytics: boolean,
  errorReporting: boolean
): Promise<void> {
  const manager = getAnalyticsConfigManager();
  await manager.setUserConsent({ analytics, errorReporting });
}

export function getAnalyticsConfig(): AnalyticsConfig {
  return getAnalyticsConfigManager().getConfig();
}
