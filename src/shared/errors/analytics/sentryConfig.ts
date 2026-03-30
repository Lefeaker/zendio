const sentryBuildEnv = globalThis as typeof globalThis & {
  __AIIINOB_SENTRY_DSN__?: string;
  __AIIINOB_SENTRY_ENVIRONMENT__?: string;
  __AIIINOB_SENTRY_RELEASE__?: string;
  __AIIINOB_SENTRY_ENABLED__?: boolean;
};

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
  const dsn = readString(sentryBuildEnv.__AIIINOB_SENTRY_DSN__);
  const environment = readString(sentryBuildEnv.__AIIINOB_SENTRY_ENVIRONMENT__) ?? 'production';
  const release = readString(sentryBuildEnv.__AIIINOB_SENTRY_RELEASE__);
  const enabledFlag =
    typeof sentryBuildEnv.__AIIINOB_SENTRY_ENABLED__ === 'boolean'
      ? sentryBuildEnv.__AIIINOB_SENTRY_ENABLED__
      : dsn !== undefined;

  return {
    enabled: Boolean(enabledFlag && dsn),
    ...(dsn !== undefined && { dsn }),
    environment,
    ...(release !== undefined && { release })
  };
}
