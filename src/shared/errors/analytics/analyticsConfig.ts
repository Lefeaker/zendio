import type { StorageService } from '@platform/interfaces/storage';
import {
  DEFAULT_ANALYTICS_MEASUREMENT_ID,
  normalizeAnalyticsTransportMode,
  normalizeMeasurementId,
  normalizeProxyEndpoint,
  readAnalyticsPublicBuildConfig,
  type AnalyticsTransportMode
} from '../../analytics/analyticsEnvironment';

export const GA4_CONFIG = {
  MEASUREMENT_ID: DEFAULT_ANALYTICS_MEASUREMENT_ID,
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
  transportMode: AnalyticsTransportMode;
  proxyEndpoint?: string;
  clientId?: string;
  sessionId?: string;
  userConsent?: UserConsent;
  reportingInterval: number;
  maxErrorsPerSession: number;
  batchSize: number;
}

const PUBLIC_BUILD_ANALYTICS_CONFIG = readAnalyticsPublicBuildConfig();

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false,
  debugMode: false,
  measurementId: PUBLIC_BUILD_ANALYTICS_CONFIG.measurementId ?? GA4_CONFIG.MEASUREMENT_ID,
  transportMode: PUBLIC_BUILD_ANALYTICS_CONFIG.transportMode ?? 'disabled',
  ...(PUBLIC_BUILD_ANALYTICS_CONFIG.proxyEndpoint
    ? { proxyEndpoint: PUBLIC_BUILD_ANALYTICS_CONFIG.proxyEndpoint }
    : {}),
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
    await this.ensureSessionId();
  }

  async refreshFromStorage(): Promise<void> {
    const { CLIENT_ID, CONFIG, SESSION_ID, USER_CONSENT } = GA4_CONFIG.STORAGE_KEYS;
    const storedConfig = await this.storage.local.get<Partial<AnalyticsConfig>>(CONFIG);
    const storedConsent = await this.storage.local.get<UserConsent>(USER_CONSENT);
    const storedClientId = await this.storage.local.get<string>(CLIENT_ID);
    const storedSessionId = await this.storage.local.get<string>(SESSION_ID);

    this.config = normalizeAnalyticsConfig(storedConfig ?? {});

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
    this.config = normalizeAnalyticsConfig({
      ...this.config,
      ...updates
    });
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
    transportMode: AnalyticsTransportMode;
    proxyEndpoint?: string;
  } {
    return {
      enabled: this.config.enabled,
      hasConsent: this.hasUserConsent(),
      ...(this.config.clientId ? { clientId: `${this.config.clientId.slice(0, 10)}...` } : {}),
      ...(this.config.sessionId ? { sessionId: `${this.config.sessionId.slice(0, 10)}...` } : {}),
      measurementId: this.config.measurementId,
      debugMode: this.config.debugMode,
      reportingInterval: this.config.reportingInterval,
      maxErrorsPerSession: this.config.maxErrorsPerSession,
      transportMode: this.config.transportMode,
      ...(this.config.proxyEndpoint ? { proxyEndpoint: this.config.proxyEndpoint } : {})
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

  private async ensureSessionId(): Promise<void> {
    const existingSessionId =
      this.config.sessionId ??
      (await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.SESSION_ID));
    if (existingSessionId) {
      this.config.sessionId = existingSessionId;
      return;
    }
    await this.renewSession();
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

export async function refreshAnalyticsConfig(): Promise<AnalyticsConfig> {
  const manager = getAnalyticsConfigManager();
  await manager.refreshFromStorage();
  return manager.getConfig();
}

export function watchAnalyticsConfigStorage(
  onRefresh?: (config: AnalyticsConfig) => void
): () => void {
  if (!analyticsStorage) {
    throw new Error('[Analytics Config] StorageService is not configured.');
  }
  const storage = analyticsStorage;

  let refreshPromise: Promise<void> | null = null;
  const refresh = (): void => {
    refreshPromise = (refreshPromise ?? Promise.resolve())
      .then(async () => {
        const config = await refreshAnalyticsConfig();
        onRefresh?.(config);
      })
      .catch((error) => {
        console.warn('[Analytics Config] Failed to refresh analytics config:', error);
      })
      .finally(() => {
        refreshPromise = null;
      });
  };

  const { CLIENT_ID, CONFIG, SESSION_ID, USER_CONSENT } = GA4_CONFIG.STORAGE_KEYS;
  const unwatchers = [CONFIG, USER_CONSENT, CLIENT_ID, SESSION_ID].map((key) =>
    storage.local.watchKey(key, refresh)
  );

  return () => {
    unwatchers.forEach((unwatch) => unwatch());
  };
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

function normalizeAnalyticsConfig(storedConfig: Partial<AnalyticsConfig>): AnalyticsConfig {
  const defaultConfigWithoutProxyEndpoint = {
    enabled: DEFAULT_ANALYTICS_CONFIG.enabled,
    debugMode: DEFAULT_ANALYTICS_CONFIG.debugMode,
    measurementId: DEFAULT_ANALYTICS_CONFIG.measurementId,
    transportMode: DEFAULT_ANALYTICS_CONFIG.transportMode,
    reportingInterval: DEFAULT_ANALYTICS_CONFIG.reportingInterval,
    maxErrorsPerSession: DEFAULT_ANALYTICS_CONFIG.maxErrorsPerSession,
    batchSize: DEFAULT_ANALYTICS_CONFIG.batchSize
  } satisfies AnalyticsConfig;
  const hasStoredTransportMode = Object.prototype.hasOwnProperty.call(
    storedConfig,
    'transportMode'
  );
  const transportMode = hasStoredTransportMode
    ? (normalizeAnalyticsTransportMode(storedConfig.transportMode, 'disabled') ?? 'disabled')
    : DEFAULT_ANALYTICS_CONFIG.transportMode;
  const proxyEndpoint =
    transportMode === 'proxy' || transportMode === 'directDebug'
      ? Object.prototype.hasOwnProperty.call(storedConfig, 'proxyEndpoint')
        ? normalizeProxyEndpoint(storedConfig.proxyEndpoint)
        : DEFAULT_ANALYTICS_CONFIG.proxyEndpoint
      : undefined;

  return {
    ...defaultConfigWithoutProxyEndpoint,
    enabled: typeof storedConfig.enabled === 'boolean' ? storedConfig.enabled : false,
    debugMode:
      typeof storedConfig.debugMode === 'boolean'
        ? storedConfig.debugMode
        : DEFAULT_ANALYTICS_CONFIG.debugMode,
    measurementId:
      normalizeMeasurementId(storedConfig.measurementId, DEFAULT_ANALYTICS_CONFIG.measurementId) ??
      DEFAULT_ANALYTICS_CONFIG.measurementId,
    transportMode,
    ...(proxyEndpoint ? { proxyEndpoint } : {}),
    reportingInterval: normalizePositiveInteger(
      storedConfig.reportingInterval,
      DEFAULT_ANALYTICS_CONFIG.reportingInterval
    ),
    maxErrorsPerSession: normalizePositiveInteger(
      storedConfig.maxErrorsPerSession,
      DEFAULT_ANALYTICS_CONFIG.maxErrorsPerSession
    ),
    batchSize: normalizePositiveInteger(storedConfig.batchSize, DEFAULT_ANALYTICS_CONFIG.batchSize),
    ...(storedConfig.clientId ? { clientId: storedConfig.clientId } : {}),
    ...(storedConfig.sessionId ? { sessionId: storedConfig.sessionId } : {}),
    ...(storedConfig.userConsent ? { userConsent: { ...storedConfig.userConsent } } : {})
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
