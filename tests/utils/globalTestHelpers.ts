import type { JSDOM } from 'jsdom';

type GlobalKeys =
  | 'window'
  | 'document'
  | 'Node'
  | 'HTMLElement'
  | 'HTMLIFrameElement'
  | 'Element'
  | 'localStorage'
  | 'chrome';

export type GlobalSnapshot = Partial<Record<GlobalKeys, unknown>>;

const globalTarget = globalThis as Record<string, unknown>;
const GLOBAL_KEYS: GlobalKeys[] = [
  'window',
  'document',
  'Node',
  'HTMLElement',
  'HTMLIFrameElement',
  'Element',
  'localStorage',
  'chrome'
];

function setValue(key: GlobalKeys, value: unknown): void {
  if (value === undefined) {
    if (key in globalTarget) {
      delete globalTarget[key];
    }
    return;
  }
  globalTarget[key] = value;
}

export function captureGlobalSnapshot(): GlobalSnapshot {
  const snapshot: GlobalSnapshot = {};
  for (const key of GLOBAL_KEYS) {
    snapshot[key] = globalTarget[key];
  }
  return snapshot;
}

export function restoreGlobalSnapshot(snapshot: GlobalSnapshot): void {
  for (const key of GLOBAL_KEYS) {
    setValue(key, snapshot[key]);
  }
}

export function assignGlobalValues(values: Partial<GlobalSnapshot>): void {
  for (const key of Object.keys(values) as GlobalKeys[]) {
    setValue(key, values[key]);
  }
}

export function installJsdom(dom: JSDOM, options: { includeLocalStorage?: boolean } = {}): void {
  const { includeLocalStorage = true } = options;
  assignGlobalValues({
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
    HTMLIFrameElement: dom.window.HTMLIFrameElement,
    Element: dom.window.Element,
    localStorage: includeLocalStorage ? dom.window.localStorage : undefined
  });
}

export function mockDate(value: string | Date): () => void {
  const fixed = typeof value === 'string' ? new Date(value) : new Date(value);
  const OriginalDate = Date;
  class MockDate extends OriginalDate {
    constructor(...args: unknown[]) {
      super();
      if (args.length === 0) {
        return new OriginalDate(fixed) as MockDate;
      }
      return new OriginalDate(...(args as ConstructorParameters<typeof OriginalDate>)) as MockDate;
    }

    static now(): number {
      return fixed.getTime();
    }
  }

  globalThis.Date = MockDate as unknown as DateConstructor;

  return () => {
    globalThis.Date = OriginalDate;
  };
}
