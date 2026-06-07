const sentryBuildEnv = globalThis as typeof globalThis & {
  __ZENDIO_SENTRY_DSN__?: string;
  __ZENDIO_SENTRY_ENVIRONMENT__?: string;
  __ZENDIO_SENTRY_RELEASE__?: string;
  __ZENDIO_SENTRY_ENABLED__?: boolean;
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

function resolveRuntimeAlias<T>(newValue: T | undefined, oldValue: T | undefined): T | undefined {
  return newValue !== undefined ? newValue : oldValue;
}

export function getSentryBuildConfig(): SentryBuildConfig {
  const dsn = readString(
    resolveRuntimeAlias(sentryBuildEnv.__ZENDIO_SENTRY_DSN__, sentryBuildEnv.__AIIINOB_SENTRY_DSN__)
  );
  const environment =
    readString(
      resolveRuntimeAlias(
        sentryBuildEnv.__ZENDIO_SENTRY_ENVIRONMENT__,
        sentryBuildEnv.__AIIINOB_SENTRY_ENVIRONMENT__
      )
    ) ?? 'production';
  const release = readString(
    resolveRuntimeAlias(
      sentryBuildEnv.__ZENDIO_SENTRY_RELEASE__,
      sentryBuildEnv.__AIIINOB_SENTRY_RELEASE__
    )
  );
  const enabled = resolveRuntimeAlias(
    sentryBuildEnv.__ZENDIO_SENTRY_ENABLED__,
    sentryBuildEnv.__AIIINOB_SENTRY_ENABLED__
  );
  const enabledFlag = typeof enabled === 'boolean' ? enabled : dsn !== undefined;

  return {
    enabled: Boolean(enabledFlag && dsn),
    ...(dsn !== undefined && { dsn }),
    environment,
    ...(release !== undefined && { release })
  };
}
