/**
 * Analytics 配置模板文件
 *
 * 使用说明：
 * 1. 复制此文件为 analyticsConfig.ts（如果你在本地维护独立模板）
 * 2. 通过公开 build globals 注入 Measurement ID / Relay Endpoint / Transport Mode
 * 3. 不要在扩展端源码中写入任何 GA secret
 */
import type { StorageService } from '@platform/interfaces/storage';

declare const __AIIINOB_GA_MEASUREMENT_ID__: string | undefined;
declare const __AIIINOB_GA_RELAY_ENDPOINT__: string | undefined;
declare const __AIIINOB_GA_TRANSPORT_MODE__: string | undefined;

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

export type AnalyticsTransportMode = 'disabled' | 'relay' | 'directDebug';
type AnalyticsConfigInput = unknown;

interface AnalyticsBuildEnv {
  __AIIINOB_GA_MEASUREMENT_ID__?: string;
  __AIIINOB_GA_RELAY_ENDPOINT__?: string;
  __AIIINOB_GA_TRANSPORT_MODE__?: string;
}

export interface UserConsent {
  analytics: boolean;
  errorReporting: boolean;
  timestamp: number;
  version: string;
}

export interface AnalyticsBuildConfig {
  measurementId: string;
  transportMode: AnalyticsTransportMode;
  relayEndpoint?: string;
}

export interface AnalyticsConfig extends AnalyticsBuildConfig {
  enabled: boolean;
  debugMode: boolean;
  clientId?: string;
  sessionId?: string;
  userConsent?: UserConsent;
  reportingInterval: number;
  maxErrorsPerSession: number;
  batchSize: number;
}

type PersistedAnalyticsConfig = Pick<
  AnalyticsConfig,
  | 'enabled'
  | 'debugMode'
  | 'measurementId'
  | 'transportMode'
  | 'relayEndpoint'
  | 'reportingInterval'
  | 'maxErrorsPerSession'
  | 'batchSize'
>;

function readTrimmedString(value: AnalyticsConfigInput): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readPublicBuildString(
  key: keyof AnalyticsBuildEnv,
  injectedValue: string | undefined
): string | undefined {
  return readTrimmedString(injectedValue) ?? readTrimmedString(Reflect.get(globalThis, key));
}

function normalizeTransportMode(value: AnalyticsConfigInput): AnalyticsTransportMode {
  return value === 'relay' || value === 'directDebug' || value === 'disabled' ? value : 'disabled';
}

function normalizeMeasurementId(value: AnalyticsConfigInput, fallback: string): string {
  const normalized = readTrimmedString(value);
  return normalized && normalized !== GA4_CONFIG.MEASUREMENT_ID ? normalized : fallback;
}

function normalizeNumber(value: AnalyticsConfigInput, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cloneUserConsent(consent: UserConsent | undefined): UserConsent | undefined {
  if (!consent) {
    return undefined;
  }

  return {
    analytics: Boolean(consent.analytics),
    errorReporting: Boolean(consent.errorReporting),
    timestamp: normalizeNumber(consent.timestamp, Date.now()),
    version: readTrimmedString(consent.version) ?? '1.0'
  };
}

export function getAnalyticsBuildConfig(): AnalyticsBuildConfig {
  const measurementId = normalizeMeasurementId(
    readPublicBuildString(
      '__AIIINOB_GA_MEASUREMENT_ID__',
      typeof __AIIINOB_GA_MEASUREMENT_ID__ === 'string' ? __AIIINOB_GA_MEASUREMENT_ID__ : undefined
    ),
    GA4_CONFIG.MEASUREMENT_ID
  );
  const relayEndpoint = readPublicBuildString(
    '__AIIINOB_GA_RELAY_ENDPOINT__',
    typeof __AIIINOB_GA_RELAY_ENDPOINT__ === 'string' ? __AIIINOB_GA_RELAY_ENDPOINT__ : undefined
  );
  const transportMode = normalizeTransportMode(
    readPublicBuildString(
      '__AIIINOB_GA_TRANSPORT_MODE__',
      typeof __AIIINOB_GA_TRANSPORT_MODE__ === 'string' ? __AIIINOB_GA_TRANSPORT_MODE__ : undefined
    )
  );

  return {
    measurementId,
    transportMode,
    ...(relayEndpoint !== undefined && { relayEndpoint })
  };
}

function normalizePersistedAnalyticsConfig(
  candidate: Partial<AnalyticsConfig> | undefined
): PersistedAnalyticsConfig {
  const buildConfig = getAnalyticsBuildConfig();
  const merged = {
    enabled: false,
    debugMode: false,
    measurementId: buildConfig.measurementId,
    transportMode: buildConfig.transportMode,
    relayEndpoint: buildConfig.relayEndpoint,
    reportingInterval: 30000,
    maxErrorsPerSession: 50,
    batchSize: 10,
    ...(candidate ?? {})
  };

  const measurementId = normalizeMeasurementId(merged.measurementId, buildConfig.measurementId);
  const relayEndpoint = readTrimmedString(merged.relayEndpoint);

  return {
    enabled: Boolean(merged.enabled),
    debugMode: Boolean(merged.debugMode),
    measurementId,
    transportMode: normalizeTransportMode(merged.transportMode),
    ...(relayEndpoint !== undefined && { relayEndpoint }),
    reportingInterval: normalizeNumber(merged.reportingInterval, 30000),
    maxErrorsPerSession: normalizeNumber(merged.maxErrorsPerSession, 50),
    batchSize: normalizeNumber(merged.batchSize, 10)
  };
}

function buildRuntimeConfig(
  candidate: Partial<AnalyticsConfig> | undefined,
  userConsent: UserConsent | undefined,
  clientId: string | undefined,
  sessionId: string | undefined
): AnalyticsConfig {
  const normalizedConsent = cloneUserConsent(userConsent);
  const consentEnabled = Boolean(normalizedConsent?.analytics || normalizedConsent?.errorReporting);
  const persisted = normalizePersistedAnalyticsConfig({
    ...(candidate ?? {}),
    enabled: consentEnabled
  });
  const normalizedClientId = readTrimmedString(clientId);
  const normalizedSessionId = readTrimmedString(sessionId);

  return {
    ...persisted,
    ...(normalizedClientId !== undefined && { clientId: normalizedClientId }),
    ...(normalizedSessionId !== undefined && { sessionId: normalizedSessionId }),
    ...(normalizedConsent ? { userConsent: normalizedConsent } : {})
  };
}

function serializePersistedAnalyticsConfig(config: AnalyticsConfig): PersistedAnalyticsConfig {
  return normalizePersistedAnalyticsConfig(config);
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = normalizePersistedAnalyticsConfig({
  enabled: false
});

export class AnalyticsConfigManager {
  private config: AnalyticsConfig = { ...DEFAULT_ANALYTICS_CONFIG };

  constructor(private readonly storage: StorageService) {}

  async initialize(): Promise<void> {
    await this.refreshFromStorage();
    await this.ensureClientId();
    await this.ensureSessionId();
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

    this.config = buildRuntimeConfig(storedConfig, storedConsent, storedClientId, storedSessionId);

    if (storedConfig !== undefined) {
      const normalizedStoredConfig = serializePersistedAnalyticsConfig(this.config);
      if (JSON.stringify(storedConfig) !== JSON.stringify(normalizedStoredConfig)) {
        await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CONFIG, normalizedStoredConfig);
      }
    }
  }

  getConfig(): AnalyticsConfig {
    return {
      ...this.config,
      ...(this.config.userConsent ? { userConsent: { ...this.config.userConsent } } : {})
    };
  }

  async updateConfig(updates: Partial<AnalyticsConfig>): Promise<void> {
    this.config = buildRuntimeConfig(
      {
        ...this.config,
        ...updates
      },
      updates.userConsent ?? this.config.userConsent,
      updates.clientId ?? this.config.clientId,
      updates.sessionId ?? this.config.sessionId
    );
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

  getUserConsent(): Promise<UserConsent | undefined> {
    const consent = this.config.userConsent;
    return Promise.resolve(consent ? { ...consent } : undefined);
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
    transportMode: AnalyticsTransportMode;
    relayEndpoint?: string;
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
      transportMode: this.config.transportMode,
      ...(this.config.relayEndpoint ? { relayEndpoint: this.config.relayEndpoint } : {}),
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
      readTrimmedString(this.config.clientId) ??
      readTrimmedString(await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID));
    const clientId = existingClientId ?? this.generateClientId();

    this.config.clientId = clientId;
    if (!existingClientId) {
      await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.CLIENT_ID, clientId);
    }
  }

  private async ensureSessionId(): Promise<void> {
    const existingSessionId =
      readTrimmedString(this.config.sessionId) ??
      readTrimmedString(await this.storage.local.get<string>(GA4_CONFIG.STORAGE_KEYS.SESSION_ID));
    const sessionId = existingSessionId ?? this.generateSessionId();

    this.config.sessionId = sessionId;
    if (!existingSessionId) {
      await this.storage.local.set(GA4_CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);
    }
  }

  private async saveConfig(): Promise<void> {
    await this.storage.local.set(
      GA4_CONFIG.STORAGE_KEYS.CONFIG,
      serializePersistedAnalyticsConfig(this.config)
    );
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
