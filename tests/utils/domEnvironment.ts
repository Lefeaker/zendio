import { JSDOM } from 'jsdom';

export type DomGlobalKey =
  | 'self'
  | 'document'
  | 'navigator'
  | 'HTMLElement'
  | 'HTMLInputElement'
  | 'HTMLTextAreaElement'
  | 'HTMLSelectElement'
  | 'HTMLButtonElement'
  | 'HTMLAnchorElement'
  | 'HTMLDivElement'
  | 'HTMLSpanElement'
  | 'HTMLFormElement'
  | 'Node'
  | 'Element'
  | 'Event'
  | 'CustomEvent'
  | 'MutationObserver'
  | 'DOMParser'
  | 'performance'
  | 'setTimeout'
  | 'clearTimeout'
  | 'setInterval'
  | 'clearInterval'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame';

const DEFAULT_GLOBALS: ReadonlyArray<DomGlobalKey> = [
  'self',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLButtonElement',
  'HTMLAnchorElement',
  'HTMLDivElement',
  'HTMLSpanElement',
  'HTMLFormElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'DOMParser',
  'performance',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame'
];

export interface DomEnvironmentOptions {
  url?: string;
  globals?: ReadonlyArray<DomGlobalKey>;
}

export interface DomEnvironmentHandle {
  readonly window: Window & typeof globalThis;
  readonly document: Document;
  restore(): void;
}

function bindIfFunction<T>(target: Window & typeof globalThis, value: T): T {
  if (typeof value === 'function') {
    return ((value as unknown) as (...args: unknown[]) => unknown).bind(target) as T;
  }
  return value;
}

export function createDomEnvironment(markup: string, options: DomEnvironmentOptions = {}): DomEnvironmentHandle {
  const dom = new JSDOM(markup, { url: options.url ?? 'https://tests.local/' });
  const windowShim = dom.window as unknown as Window & typeof globalThis;
  const overrides: Array<{ key: string; descriptor: PropertyDescriptor | undefined }> = [];

  const overrideGlobal = (key: string, value: unknown) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    overrides.push({ key, descriptor });
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  };

  overrideGlobal('window', windowShim);
  overrideGlobal('self', windowShim);

  const globals = options.globals ?? DEFAULT_GLOBALS;
  for (const key of globals) {
    if (key === 'self') {
      continue;
    }
    const value: unknown = Reflect.get(windowShim, key as string);
    if (typeof value === 'undefined') {
      continue;
    }
    overrideGlobal(key, bindIfFunction(windowShim, value));
  }

  return {
    window: windowShim,
    document: windowShim.document,
    restore() {
      while (overrides.length > 0) {
        const override = overrides.pop();
        if (!override) {
          continue;
        }
        const { key, descriptor } = override;
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          Reflect.deleteProperty(globalThis, key);
        }
      }
      dom.window.close();
    }
  };
}

export async function withDomEnvironment<T>(
  markup: string,
  options: DomEnvironmentOptions = {},
  callback: (handle: DomEnvironmentHandle) => Promise<T> | T
): Promise<T> {
  const env = createDomEnvironment(markup, options);
  try {
    return await callback(env);
  } finally {
    env.restore();
  }
}
