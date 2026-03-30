import { createMemoryStorageService } from '../platform/preview/memoryStorage';
import { createPreviewPlatformServices } from '../platform/preview/services';
import { registerGlobalErrorBoundary } from '../shared/errors/globalErrorBoundary';
import { createErrorHandler } from '../shared/errors/errorHandler';
import { initializeErrorAnalytics, getErrorAnalyticsStatus } from '../shared/errors/analytics';
import {
  configureAnalyticsConfigManager,
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '../shared/errors/analytics/analyticsConfig';
import { trackUsageEvent } from '../background/services/analyticsEvents';
import { registerService, TOKENS } from '../shared/di';
import { createOptionsButtonElement } from '../ui/primitives/button';

type CapturedRequest = {
  url: string;
  method: string;
  bodyText: string;
};

const controls = document.getElementById('controls');
const status = document.getElementById('status');
const requestsHost = document.getElementById('requests');

if (!controls || !status || !requestsHost) {
  throw new Error('Harness host elements are missing');
}

const storage = createMemoryStorageService();
configureAnalyticsConfigManager(storage);
registerService(TOKENS.platformServices, () => createPreviewPlatformServices(storage));

const capturedRequests: CapturedRequest[] = [];
const originalFetch = globalThis.fetch.bind(globalThis);

Object.assign(globalThis as Record<string, unknown>, {
  __AIIINOB_SENTRY_ENABLED__: true,
  __AIIINOB_SENTRY_DSN__: 'https://public@example.ingest.sentry.io/123456',
  __AIIINOB_SENTRY_ENVIRONMENT__: 'harness',
  __AIIINOB_SENTRY_RELEASE__: 'runtime-observability-harness',
  chrome: {
    runtime: {
      getManifest: () => ({ version: '0.2.0-harness' })
    }
  }
});

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = init?.method ?? 'GET';
  const bodyText =
    typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : init?.body
          ? '[non-text body]'
          : '';

  capturedRequests.unshift({ url, method, bodyText });
  renderRequests();

  return new Response('{"ok":true}', {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
};

const errorHandler = createErrorHandler();
const cleanupBoundary = registerGlobalErrorBoundary({
  domain: 'content',
  errorHandler,
  target: window,
  metadata: {
    extensionContext: 'runtime-observability-harness'
  }
});

function setStatus(message: string): void {
  status.textContent = message;
}

function renderRequests(): void {
  requestsHost.replaceChildren(
    ...capturedRequests.map((request, index) => {
      const card = document.createElement('article');
      card.className = 'rounded-xl border border-base-300 bg-base-200/40 p-4';

      const title = document.createElement('div');
      title.className = 'text-sm font-semibold text-base-content';
      title.textContent = `${index + 1}. ${request.method} ${request.url}`;

      const body = document.createElement('pre');
      body.className =
        'mt-2 overflow-x-auto rounded-lg bg-base-100 p-3 text-xs text-base-content/70';
      body.textContent = request.bodyText || '[empty body]';

      card.append(title, body);
      return card;
    })
  );
}

async function enableReporting(): Promise<void> {
  await setAnalyticsConsent(true, true);
  await getAnalyticsConfigManager().updateConfig({ debugMode: true });
  await initializeErrorAnalytics(errorHandler);
  const currentStatus = getErrorAnalyticsStatus();
  setStatus(
    `Reporting enabled. reporters=${currentStatus.reporters.join(',') || 'none'} debugMode=true`
  );
}

async function triggerErrorEvent(): Promise<void> {
  window.dispatchEvent(
    new ErrorEvent('error', {
      message: 'Harness error event',
      error: new Error('Harness error event'),
      filename: 'runtime-observability-harness.ts',
      lineno: 101,
      colno: 7
    })
  );
  await Promise.resolve();
  setStatus('Triggered error event via global error boundary');
}

async function triggerUnhandledRejection(): Promise<void> {
  const event = new Event('unhandledrejection');
  Object.defineProperty(event, 'reason', {
    configurable: true,
    value: new Error('Harness rejection event')
  });
  window.dispatchEvent(event);
  await Promise.resolve();
  setStatus('Triggered unhandledrejection via global error boundary');
}

async function sendUsageEvent(): Promise<void> {
  await trackUsageEvent('runtime_harness_open', {
    source: 'runtime-observability-harness'
  });
  setStatus('Sent background usage event through GA4 endpoint');
}

function clearRequests(): void {
  capturedRequests.length = 0;
  renderRequests();
  setStatus('Cleared captured requests');
}

function createControlButton(
  label: string,
  handler: () => void | Promise<void>
): HTMLButtonElement {
  return createOptionsButtonElement({
    label,
    variant: 'primary',
    onClick: () => {
      void handler();
    }
  });
}

controls.append(
  createControlButton('Enable Reporting', enableReporting),
  createControlButton('Trigger Error Event', triggerErrorEvent),
  createControlButton('Trigger Rejection Event', triggerUnhandledRejection),
  createControlButton('Send Usage Event', sendUsageEvent),
  createControlButton('Clear Requests', clearRequests)
);

(
  window as Window & {
    harness?: {
      enableReporting: typeof enableReporting;
      triggerErrorEvent: typeof triggerErrorEvent;
      triggerUnhandledRejection: typeof triggerUnhandledRejection;
      sendUsageEvent: typeof sendUsageEvent;
      clearRequests: typeof clearRequests;
    };
  }
).harness = {
  enableReporting,
  triggerErrorEvent,
  triggerUnhandledRejection,
  sendUsageEvent,
  clearRequests
};

window.addEventListener('beforeunload', () => {
  cleanupBoundary();
  globalThis.fetch = originalFetch;
});

setStatus('Harness ready');
