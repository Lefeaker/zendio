const MANAGED_FALLBACK_ATTR = 'data-aiob-style-bridge';

const managedSheetsByRoot = new WeakMap<ShadowRoot, Map<string, CSSStyleSheet>>();

// Cross-browser policy:
// - Chromium content UIs can use constructed stylesheets directly.
// - Firefox WebExtension content scripts still need a managed <style> fallback because
//   adoptedStyleSheets assignment remains blocked by Xray-wrapper constraints.
export function supportsAdoptedStyleSheets(): boolean {
  return (
    typeof Document !== 'undefined' &&
    typeof CSSStyleSheet !== 'undefined' &&
    'adoptedStyleSheets' in Document.prototype &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function'
  );
}

export function createManagedStyleSheet(cssText: string): CSSStyleSheet | null {
  if (!supportsAdoptedStyleSheets()) {
    return null;
  }
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    return sheet;
  } catch (error) {
    console.warn('[shadowStyleBridge] Failed to create managed stylesheet:', error);
    return null;
  }
}

export function applyManagedShadowStyle(
  shadowRoot: ShadowRoot,
  key: string,
  cssText: string,
  sheet: CSSStyleSheet | null
): void {
  if (sheet) {
    detachManagedFallbackStyle(shadowRoot, key);

    const managedSheets = managedSheetsByRoot.get(shadowRoot) ?? new Map<string, CSSStyleSheet>();
    const previousSheet = managedSheets.get(key) ?? null;
    managedSheets.set(key, sheet);
    managedSheetsByRoot.set(shadowRoot, managedSheets);

    const managedSheetSet = new Set(managedSheets.values());
    const nextSheets = shadowRoot.adoptedStyleSheets.filter((entry) => {
      if (entry === previousSheet) {
        return false;
      }
      return !managedSheetSet.has(entry);
    });
    nextSheets.push(...managedSheets.values());
    shadowRoot.adoptedStyleSheets = nextSheets;
    return;
  }

  detachManagedSheet(shadowRoot, key);
  const fallbackStyle = ensureManagedFallbackStyle(shadowRoot, key);
  fallbackStyle.textContent = cssText;
}

export function removeManagedShadowStyle(shadowRoot: ShadowRoot, key: string): void {
  detachManagedSheet(shadowRoot, key);
  detachManagedFallbackStyle(shadowRoot, key);
}

export function createManagedStyleElement(doc: Document, key: string, cssText: string): HTMLStyleElement {
  const style = doc.createElement('style');
  style.setAttribute(MANAGED_FALLBACK_ATTR, key);
  style.textContent = cssText;
  return style;
}

function detachManagedSheet(shadowRoot: ShadowRoot, key: string): void {
  const managedSheets = managedSheetsByRoot.get(shadowRoot);
  if (!managedSheets) {
    return;
  }
  const sheet = managedSheets.get(key);
  if (!sheet) {
    return;
  }
  managedSheets.delete(key);
  shadowRoot.adoptedStyleSheets = shadowRoot.adoptedStyleSheets.filter((entry) => entry !== sheet);
  if (managedSheets.size === 0) {
    managedSheetsByRoot.delete(shadowRoot);
  }
}

function ensureManagedFallbackStyle(shadowRoot: ShadowRoot, key: string): HTMLStyleElement {
  const selector = `style[${MANAGED_FALLBACK_ATTR}="${key}"]`;
  const existing = shadowRoot.querySelector<HTMLStyleElement>(selector);
  if (existing) {
    return existing;
  }
  const style = createManagedStyleElement(shadowRoot.ownerDocument ?? document, key, '');
  try {
    shadowRoot.insertBefore(style, shadowRoot.firstChild);
  } catch {
    shadowRoot.appendChild(style);
  }
  return style;
}

function detachManagedFallbackStyle(shadowRoot: ShadowRoot, key: string): void {
  const style = shadowRoot.querySelector<HTMLStyleElement>(`style[${MANAGED_FALLBACK_ATTR}="${key}"]`);
  style?.remove();
}
