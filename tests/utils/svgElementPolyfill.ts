type SvgConstructorName =
  | 'SVGElement'
  | 'SVGSVGElement'
  | 'SVGGraphicsElement'
  | 'SVGGElement'
  | 'SVGPathElement';

/**
 * JSDOM 没有完整实现 SVG 构造函数，UsageSection 等需要通过 instanceof 来判断。
 * 通过将缺失的构造函数回退到原生 Element，可以避免 ReferenceError 并满足 instanceof 判断。
 */
export function ensureSvgElementConstructors(): void {
  if (typeof window === 'undefined' || typeof window.Element !== 'function') {
    return;
  }

  const globalTarget = globalThis as Record<SvgConstructorName, unknown>;
  const fallbackCtor =
    (globalTarget.SVGElement as typeof Element | undefined) ??
    window.Element;

  const ctorNames: SvgConstructorName[] = [
    'SVGElement',
    'SVGSVGElement',
    'SVGGraphicsElement',
    'SVGGElement',
    'SVGPathElement'
  ];

  for (const name of ctorNames) {
    if (typeof globalTarget[name] !== 'function') {
      globalTarget[name] = fallbackCtor;
    }
  }
}
