declare const __DEV__: boolean;
declare const __ZENDIO_SENTRY_DSN__: string | undefined;
declare const __ZENDIO_SENTRY_ENVIRONMENT__: string | undefined;
declare const __ZENDIO_SENTRY_RELEASE__: string | undefined;
declare const __ZENDIO_SENTRY_ENABLED__: boolean | undefined;
declare const __AIIINOB_SENTRY_DSN__: string | undefined;
declare const __AIIINOB_SENTRY_ENVIRONMENT__: string | undefined;
declare const __AIIINOB_SENTRY_RELEASE__: string | undefined;
declare const __AIIINOB_SENTRY_ENABLED__: boolean | undefined;

declare module '*.css?inline' {
  const content: string;
  export default content;
}
