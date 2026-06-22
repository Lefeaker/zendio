/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clipperStyleSheetManager } from '@content/clipper/shared/styleSheetManager';
import { clearClipperStyleCache } from '@content/clipper/shared/styleRegistry';
import { withDomEnvironment, type DomGlobalKey } from '../../utils/domEnvironment';

type WindowShim = Window & typeof globalThis;
const INTERNAL_DOC_SHEETS = Symbol('aiob-adopted-styles');
const DOM_GLOBALS: DomGlobalKey[] = [
  'document',
  'navigator',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLSpanElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent'
] as const;

describe('phase4/shadow-dom adoptedStyleSheets', () => {
  beforeEach(() => {
    clipperStyleSheetManager.destroy();
    clearClipperStyleCache();
  });

  afterEach(() => {
    clipperStyleSheetManager.destroy();
    clearClipperStyleCache();
  });

  it('reuses a single constructable stylesheet across shadow roots when supported', async () => {
    await withDomEnvironment(
      '<!DOCTYPE html><html><body></body></html>',
      { globals: DOM_GLOBALS },
      async ({ document, window }) => {
        const restoreFetch = stubClipperFetch(window);
        const restore = enableConstructableStyles(window);
        try {
          await clipperStyleSheetManager.initialize();

          const firstHost = document.createElement('div');
          document.body.append(firstHost);
          const firstShadow = firstHost.attachShadow({ mode: 'open' });
          clipperStyleSheetManager.applyTo(firstShadow);

          expect(firstShadow.adoptedStyleSheets).toHaveLength(2);
          const firstSheets = firstShadow.adoptedStyleSheets;

          const secondHost = document.createElement('div');
          document.body.append(secondHost);
          const secondShadow = secondHost.attachShadow({ mode: 'open' });
          clipperStyleSheetManager.applyTo(secondShadow);

          expect(secondShadow.adoptedStyleSheets).toHaveLength(2);
          expect(secondShadow.adoptedStyleSheets).toEqual(firstSheets);
        } finally {
          restore();
          restoreFetch();
        }
      }
    );
  });

  it('handles Firefox-style adoptedStyleSheets collections without Array methods', async () => {
    await withDomEnvironment(
      '<!DOCTYPE html><html><body></body></html>',
      { globals: DOM_GLOBALS },
      async ({ document, window }) => {
        const restoreFetch = stubClipperFetch(window);
        const restore = enableConstructableStyles(window, { firefoxCollection: true });
        try {
          await clipperStyleSheetManager.initialize();

          const host = document.createElement('div');
          document.body.append(host);
          const shadow = host.attachShadow({ mode: 'open' });

          expect(() => clipperStyleSheetManager.applyTo(shadow)).not.toThrow();
          expect(Array.from(shadow.adoptedStyleSheets)).toHaveLength(2);
          expect(shadow.querySelectorAll('style')).toHaveLength(0);
        } finally {
          restore();
          restoreFetch();
        }
      }
    );
  });

  it('falls back to inline style tags when Firefox blocks shadow adoptedStyleSheets access', async () => {
    await withDomEnvironment(
      '<!DOCTYPE html><html><body></body></html>',
      { globals: DOM_GLOBALS },
      async ({ document, window }) => {
        const restoreFetch = stubClipperFetch(window);
        const restore = enableConstructableStyles(window, { shadowAccessBlocked: true });
        try {
          await clipperStyleSheetManager.initialize();

          const host = document.createElement('div');
          document.body.append(host);
          const shadow = host.attachShadow({ mode: 'open' });

          expect(() => clipperStyleSheetManager.applyTo(shadow)).not.toThrow();
          expect(shadow.querySelectorAll('style')).toHaveLength(2);
        } finally {
          restore();
          restoreFetch();
        }
      }
    );
  });

  it('falls back to inline style tags when constructable styles are unavailable', async () => {
    await withDomEnvironment(
      '<!DOCTYPE html><html><body></body></html>',
      { globals: DOM_GLOBALS },
      async ({ document, window }) => {
        const restoreFetch = stubClipperFetch(window);
        try {
          await clipperStyleSheetManager.initialize();
          const host = document.createElement('div');
          document.body.append(host);
          const shadow = host.attachShadow({ mode: 'open' });
          clipperStyleSheetManager.applyTo(shadow);

          expect(shadow.adoptedStyleSheets ?? []).toHaveLength(0);
          expect(shadow.querySelectorAll('style').length).toBeGreaterThan(0);
        } finally {
          restoreFetch();
        }
      }
    );
  });
});

function stubClipperFetch(window: WindowShim): () => void {
  const globals = globalThis as typeof globalThis & {
    fetch?: typeof fetch;
  };
  const originalFetch = globals.fetch;
  const cssResponse = {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve('.clipper-test{display:block;}')
  } as Response;
  const fetchStub = ((input: RequestInfo | URL) => {
    const value = String(input);
    if (
      value.includes('options/stitch/styles/stitch.css') ||
      value.includes('options/stitch/styles/variants/stitch-secondary.css')
    ) {
      return Promise.resolve(cssResponse);
    }
    return Promise.reject(new Error(`Unexpected fetch: ${value}`));
  }) as typeof fetch;
  globals.fetch = fetchStub;
  window.fetch = fetchStub;
  return () => {
    globals.fetch = originalFetch;
    if (typeof originalFetch === 'undefined') {
      Reflect.deleteProperty(window, 'fetch');
    } else {
      window.fetch = originalFetch;
    }
  };
}

function enableConstructableStyles(
  window: WindowShim,
  options: { firefoxCollection?: boolean; shadowAccessBlocked?: boolean } = {}
): () => void {
  const globals = globalThis as typeof globalThis & {
    Document?: typeof window.Document;
    CSSStyleSheet?: typeof window.CSSStyleSheet;
  };

  const docProto = window.Document.prototype as Document & {
    [INTERNAL_DOC_SHEETS]?: CSSStyleSheet[];
  };
  const shadowProto = window.ShadowRoot.prototype as ShadowRoot & {
    [INTERNAL_DOC_SHEETS]?: CSSStyleSheet[];
  };

  const originalDocumentCtor = globals.Document;
  globals.Document = window.Document;

  const originalDocDescriptor = Object.getOwnPropertyDescriptor(docProto, 'adoptedStyleSheets');
  const originalShadowDescriptor = Object.getOwnPropertyDescriptor(
    shadowProto,
    'adoptedStyleSheets'
  );

  Object.defineProperty(
    docProto,
    'adoptedStyleSheets',
    createAdoptedDescriptor<Document>(window, options)
  );
  Object.defineProperty(
    shadowProto,
    'adoptedStyleSheets',
    createAdoptedDescriptor<ShadowRoot>(window, options)
  );

  class FakeConstructableStyleSheet {
    private cssText = '';

    replaceSync(css: string): void {
      this.cssText = css;
    }
  }

  const fakeCtor = FakeConstructableStyleSheet as unknown as typeof window.CSSStyleSheet;
  const originalCSSConstructor = globals.CSSStyleSheet;
  globals.CSSStyleSheet = fakeCtor;
  (window as WindowShim & { CSSStyleSheet: typeof fakeCtor }).CSSStyleSheet = fakeCtor;

  return () => {
    if (originalDocDescriptor) {
      Object.defineProperty(docProto, 'adoptedStyleSheets', originalDocDescriptor);
    } else {
      Reflect.deleteProperty(docProto, 'adoptedStyleSheets');
    }
    if (originalShadowDescriptor) {
      Object.defineProperty(shadowProto, 'adoptedStyleSheets', originalShadowDescriptor);
    } else {
      Reflect.deleteProperty(shadowProto, 'adoptedStyleSheets');
    }
    globals.Document = originalDocumentCtor;
    globals.CSSStyleSheet = originalCSSConstructor;
  };
}

function createAdoptedDescriptor<T extends Document | ShadowRoot>(
  window: WindowShim,
  options: { firefoxCollection?: boolean; shadowAccessBlocked?: boolean } = {}
): PropertyDescriptor {
  return {
    configurable: true,
    get(this: T & { [INTERNAL_DOC_SHEETS]?: CSSStyleSheet[] }) {
      if (this instanceof window.ShadowRoot && options.shadowAccessBlocked) {
        throw new Error('Accessing from Xray wrapper is not supported.');
      }
      const sheets = this[INTERNAL_DOC_SHEETS] ?? [];
      if (!options.firefoxCollection) {
        return sheets;
      }
      return createFirefoxStyleSheetCollection(sheets);
    },
    set(this: T & { [INTERNAL_DOC_SHEETS]?: CSSStyleSheet[] }, value: CSSStyleSheet[]) {
      if (this instanceof window.ShadowRoot && options.shadowAccessBlocked) {
        throw new Error('Accessing from Xray wrapper is not supported.');
      }
      this[INTERNAL_DOC_SHEETS] = value;
    }
  };
}

function createFirefoxStyleSheetCollection(sheets: CSSStyleSheet[]): CSSStyleSheet[] {
  const collection = {
    length: sheets.length,
    item: (index: number) => sheets[index] ?? null,
    [Symbol.iterator]: () => sheets[Symbol.iterator]()
  } as CSSStyleSheet[] & { item(index: number): CSSStyleSheet | null };
  sheets.forEach((sheet, index) => {
    collection[index] = sheet;
  });
  return collection;
}
