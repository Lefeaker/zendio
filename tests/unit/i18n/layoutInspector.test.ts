import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { LayoutInspector } from '../../../tools/layout-inspector';

function assignDomGlobals(dom: JSDOM): void {
  const runtime = globalThis as typeof globalThis & Record<string, unknown>;
  runtime.window = dom.window as unknown as Window & typeof globalThis;
  runtime.document = dom.window.document;
  runtime.HTMLElement = dom.window.HTMLElement;
  runtime.Element = dom.window.Element;
  const boundGetComputedStyle: typeof window.getComputedStyle = (...args) =>
    dom.window.getComputedStyle(...args);
  runtime.getComputedStyle = boundGetComputedStyle;
}

function createElement(html: string): { dom: JSDOM; inspector: LayoutInspector } {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  assignDomGlobals(dom);
  const inspector = new LayoutInspector(dom.window.document);
  return { dom, inspector };
}

describe('LayoutInspector', () => {
  it('ignores elements that do not overflow', () => {
    const { dom, inspector } = createElement(
      '<button data-i18n="clipButton" data-component="button" style="width:200px">Clip</button>'
    );

    Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return 100;
      }
    });

    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 120;
      }
    });

    const issues = inspector.inspect('en');
    expect(issues).toHaveLength(0);
  });

  it('reports overflow when scroll width exceeds client width', () => {
    const { dom, inspector } = createElement(
      '<button data-i18n="clipButton" data-component="button" style="width:80px">Sehr langer deutscher Text</button>'
    );

    Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return 160;
      }
    });

    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 80;
      }
    });

    const issues = inspector.inspect('de');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      language: 'de',
      issue: 'overflow-x',
      key: 'clipButton',
      priority: 'high'
    });
  });
});
