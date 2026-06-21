declare const __DEV__: boolean;

export interface AnalyticsDebugModeSnapshot {
  analytics?: boolean;
  errorReporting?: boolean;
  debugMode?: boolean;
}

export function isAnalyticsDebugModeControlAvailable(): boolean {
  return typeof __DEV__ === 'boolean' ? __DEV__ : true;
}

export function normalizeAnalyticsDebugModeFlag(
  debugMode: boolean | undefined,
  controlAvailable = isAnalyticsDebugModeControlAvailable()
): boolean {
  return controlAvailable && debugMode === true;
}

export function resolveAnalyticsDebugMode(
  snapshot: AnalyticsDebugModeSnapshot,
  controlAvailable = isAnalyticsDebugModeControlAvailable()
): boolean {
  return (
    normalizeAnalyticsDebugModeFlag(snapshot.debugMode, controlAvailable) &&
    (snapshot.analytics === true || snapshot.errorReporting === true)
  );
}
