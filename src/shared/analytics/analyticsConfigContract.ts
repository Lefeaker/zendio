import type { AnalyticsTransportMode } from './analyticsEnvironment';

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
