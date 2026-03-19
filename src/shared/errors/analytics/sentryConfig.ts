export interface SentryBuildConfig {
  enabled: boolean;
  dsn?: string;
  environment?: string;
  release?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function getSentryBuildConfig(): SentryBuildConfig {
  const dsn = readString(typeof __AIIINOB_SENTRY_DSN__ !== 'undefined' ? __AIIINOB_SENTRY_DSN__ : undefined);
  const environment = readString(
    typeof __AIIINOB_SENTRY_ENVIRONMENT__ !== 'undefined' ? __AIIINOB_SENTRY_ENVIRONMENT__ : undefined
  ) ?? 'production';
  const release = readString(
    typeof __AIIINOB_SENTRY_RELEASE__ !== 'undefined' ? __AIIINOB_SENTRY_RELEASE__ : undefined
  );
  const enabledFlag =
    typeof __AIIINOB_SENTRY_ENABLED__ === 'boolean'
      ? __AIIINOB_SENTRY_ENABLED__
      : dsn !== undefined;

  return {
    enabled: Boolean(enabledFlag && dsn),
    ...(dsn !== undefined && { dsn }),
    environment,
    ...(release !== undefined && { release })
  };
}
