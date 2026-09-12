const MANAGED_FALLBACK_ATTR = 'data-aiob-style-bridge';

export interface ManagedStyleOwner {
  readonly order: number;
}

export type ManagedStyleApplyResult = 'applied' | 'superseded' | 'failed';
export type ManagedStyleRemovalResult = 'removed' | 'not-owner' | 'failed';

export interface ManagedStyleEntry {
  key: string;
  cssText: string;
  sheet?: CSSStyleSheet | null;
}

export type StyleAttachmentFailureCode =
  | 'STYLE_ATTACHMENT_DISPOSED'
  | 'STYLE_ATTACHMENT_SUPERSEDED'
  | 'STYLE_HOST_DISCONNECTED'
  | 'STYLE_HOST_COLLECTED'
  | 'STYLE_ASSET_LOAD_FAILED'
  | 'STYLE_APPLICATION_FAILED';

export type StyleAttachmentResult =
  | { status: 'ready' }
  | { status: 'failed'; code: StyleAttachmentFailureCode };

export interface StyleAttachmentHandle {
  ready: Promise<StyleAttachmentResult>;
  refresh(): Promise<StyleAttachmentResult>;
  dispose(): void;
}

export type ManagedStyleEntrySource =
  | readonly ManagedStyleEntry[]
  | (() => readonly ManagedStyleEntry[] | Promise<readonly ManagedStyleEntry[]>);

interface ManagedStyleRecord {
  owner: ManagedStyleOwner;
  sheet: CSSStyleSheet | null;
}

const managedStylesByRoot = new WeakMap<ShadowRoot, Map<string, ManagedStyleRecord>>();
const latestOwnerOrdersByRoot = new WeakMap<ShadowRoot, Map<string, number>>();
const constructableStylesBlockedRoots = new WeakSet<ShadowRoot>();
let nextOwnerOrder = 0;

export function createManagedStyleOwner(): ManagedStyleOwner {
  nextOwnerOrder += 1;
  return { order: nextOwnerOrder };
}

export function supportsAdoptedStyleSheets(): boolean {
  return (
    typeof Document !== 'undefined' &&
    typeof CSSStyleSheet !== 'undefined' &&
    'adoptedStyleSheets' in Document.prototype &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function'
  );
}

export function createManagedStyleSheet(cssText: string): CSSStyleSheet | null {
  if (!supportsAdoptedStyleSheets()) return null;
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
  root: ShadowRoot,
  key: string,
  cssText: string,
  sheet: CSSStyleSheet | null,
  owner: ManagedStyleOwner
): ManagedStyleApplyResult {
  const ownerOrders = latestOwnerOrdersByRoot.get(root) ?? new Map<string, number>();
  if ((ownerOrders.get(key) ?? 0) > owner.order) return 'superseded';
  ownerOrders.set(key, owner.order);
  latestOwnerOrdersByRoot.set(root, ownerOrders);
  const records = managedStylesByRoot.get(root) ?? new Map<string, ManagedStyleRecord>();
  if (sheet && !constructableStylesBlockedRoots.has(root)) {
    const result = replaceManagedRecord(root, records, key, { owner, sheet });
    if (result === 'superseded') return result;
    if (result === 'applied') {
      managedStylesByRoot.set(root, records);
      detachManagedFallbackStyle(root, key);
      return result;
    }
    constructableStylesBlockedRoots.add(root);
  }

  const result = replaceManagedRecord(root, records, key, { owner, sheet: null });
  if (result !== 'applied') return result;
  managedStylesByRoot.set(root, records);
  ensureManagedFallbackStyle(root, key).textContent = cssText;
  return result;
}

export function removeManagedShadowStyle(
  root: ShadowRoot,
  key: string,
  owner: ManagedStyleOwner
): ManagedStyleRemovalResult {
  const records = managedStylesByRoot.get(root);
  const record = records?.get(key);
  if (!records || !record || record.owner !== owner) return 'not-owner';

  const nextRecords = new Map(records);
  nextRecords.delete(key);
  if (
    !replaceAdoptedSheets(root, collectManagedSheets(records), collectManagedSheets(nextRecords))
  ) {
    return 'failed';
  }
  try {
    detachManagedFallbackStyle(root, key);
  } catch {
    replaceAdoptedSheets(root, collectManagedSheets(nextRecords), collectManagedSheets(records));
    return 'failed';
  }
  records.delete(key);
  if (records.size === 0) managedStylesByRoot.delete(root);
  return 'removed';
}

export function createManagedStyleElement(
  doc: Document,
  key: string,
  cssText: string
): HTMLStyleElement {
  const style = doc.createElement('style');
  style.setAttribute(MANAGED_FALLBACK_ATTR, key);
  style.textContent = cssText;
  return style;
}

function replaceManagedRecord(
  root: ShadowRoot,
  records: Map<string, ManagedStyleRecord>,
  key: string,
  next: ManagedStyleRecord
): ManagedStyleApplyResult {
  const previous = records.get(key);
  if (previous && previous.owner.order > next.owner.order) return 'superseded';
  const previousSheets = collectManagedSheets(records);
  records.set(key, next);
  if (replaceAdoptedSheets(root, previousSheets, collectManagedSheets(records))) return 'applied';
  if (previous) records.set(key, previous);
  else records.delete(key);
  return 'failed';
}

function collectManagedSheets(records: Map<string, ManagedStyleRecord>): CSSStyleSheet[] {
  return Array.from(
    new Set(
      Array.from(records.values())
        .map(({ sheet }) => sheet)
        .filter((sheet): sheet is CSSStyleSheet => sheet !== null)
    )
  );
}

function replaceAdoptedSheets(
  root: ShadowRoot,
  previousManaged: CSSStyleSheet[],
  nextManaged: CSSStyleSheet[]
): boolean {
  if (previousManaged.length === 0 && nextManaged.length === 0) return true;
  try {
    const managed = new Set([...previousManaged, ...nextManaged]);
    const external = Array.from(root.adoptedStyleSheets).filter((sheet) => !managed.has(sheet));
    root.adoptedStyleSheets = [...external, ...nextManaged];
    return true;
  } catch {
    return false;
  }
}

function ensureManagedFallbackStyle(root: ShadowRoot, key: string): HTMLStyleElement {
  const selector = `style[${MANAGED_FALLBACK_ATTR}="${key}"]`;
  const existing = root.querySelector<HTMLStyleElement>(selector);
  if (existing) return existing;
  const style = createManagedStyleElement(root.ownerDocument ?? document, key, '');
  root.append(style);
  return style;
}

function detachManagedFallbackStyle(root: ShadowRoot, key: string): void {
  root.querySelector<HTMLStyleElement>(`style[${MANAGED_FALLBACK_ATTR}="${key}"]`)?.remove();
}
