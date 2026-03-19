declare const __DEV__: boolean;
declare const __AIIINOB_SENTRY_DSN__: string | undefined;
declare const __AIIINOB_SENTRY_ENVIRONMENT__: string | undefined;
declare const __AIIINOB_SENTRY_RELEASE__: string | undefined;
declare const __AIIINOB_SENTRY_ENABLED__: boolean | undefined;

declare global {
  interface Window {
    __aiobReaderActive?: boolean;
    __aiobReaderController?: unknown;
  }
}

declare module '*.css?inline' {
  const content: string;
  export default content;
}
