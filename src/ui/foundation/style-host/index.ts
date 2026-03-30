export {
  applyManagedShadowStyle,
  createManagedStyleElement,
  createManagedStyleSheet,
  removeManagedShadowStyle,
  supportsAdoptedStyleSheets
} from '@content/shared/shadowStyleBridge';

import {
  applyManagedShadowStyle,
  createManagedStyleSheet,
  removeManagedShadowStyle,
  supportsAdoptedStyleSheets
} from '@content/shared/shadowStyleBridge';

export interface ManagedStyleEntry {
  key: string;
  cssText: string;
  sheet?: CSSStyleSheet | null;
}

export class ManagedShadowStyleHost {
  apply(root: ShadowRoot, entries: ManagedStyleEntry[]): void {
    entries.forEach((entry) => {
      const sheet =
        entry.sheet ??
        (supportsAdoptedStyleSheets() ? createManagedStyleSheet(entry.cssText) : null);
      applyManagedShadowStyle(root, entry.key, entry.cssText, sheet);
    });
  }

  remove(root: ShadowRoot, keys: string[]): void {
    keys.forEach((key) => removeManagedShadowStyle(root, key));
  }
}
