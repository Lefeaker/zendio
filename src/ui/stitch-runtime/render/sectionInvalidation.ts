export const SECTION_INVALIDATION_SCOPES = [
  'theme',
  'sidebar',
  'resource-modal',
  'overview-usage',
  'storage',
  'capture-sources',
  'capture-behavior',
  'output',
  'maintenance',
  'locale-schema',
  'all-invariant-recovery'
] as const;

export type SectionInvalidationScope = (typeof SECTION_INVALIDATION_SCOPES)[number];
export type SectionInvalidationRequest =
  | SectionInvalidationScope
  | readonly SectionInvalidationScope[];

interface SelectionSnapshot {
  anchorOffset: number;
  anchorPath: number[];
  focusOffset: number;
  focusPath: number[];
}

export interface SectionDomSnapshot {
  activePath: number[] | null;
  inputSelection: {
    direction: 'backward' | 'forward' | 'none' | null;
    end: number | null;
    start: number | null;
  } | null;
  mainScrollTop: number;
  selection: SelectionSnapshot | null;
  windowScroll: { x: number; y: number };
}

export interface SectionInvalidationOwner {
  readonly active: boolean;
  dispose(): void;
  invalidate(request: SectionInvalidationRequest): void;
}

const VALID_SCOPES = new Set<string>(SECTION_INVALIDATION_SCOPES);

function pathFromRoot(root: Node, node: Node | null): number[] | null {
  if (!node || (node !== root && !root.contains(node))) return null;
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current) as number);
    current = parent;
  }
  return current === root ? path : null;
}

function nodeFromPath(root: Node, path: readonly number[]): Node | null {
  let current: Node | null = root;
  for (const index of path) current = current?.childNodes.item(index) ?? null;
  return current;
}

function captureSelection(root: HTMLElement): SelectionSnapshot | null {
  const selection = window.getSelection?.();
  if (!selection?.anchorNode || !selection.focusNode || selection.rangeCount === 0) return null;
  const anchorPath = pathFromRoot(root, selection.anchorNode);
  const focusPath = pathFromRoot(root, selection.focusNode);
  return anchorPath && focusPath
    ? {
        anchorOffset: selection.anchorOffset,
        anchorPath,
        focusOffset: selection.focusOffset,
        focusPath
      }
    : null;
}

export function captureSectionDomSnapshot(root: HTMLElement): SectionDomSnapshot {
  const active = document.activeElement;
  const input =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
  return {
    activePath: active instanceof Node ? pathFromRoot(root, active) : null,
    inputSelection: input
      ? {
          direction: input.selectionDirection,
          end: input.selectionEnd,
          start: input.selectionStart
        }
      : null,
    mainScrollTop: root.querySelector<HTMLElement>('.main')?.scrollTop ?? 0,
    selection: input ? null : captureSelection(root),
    windowScroll: { x: window.scrollX, y: window.scrollY }
  };
}

export function restoreSectionDomSnapshot(root: HTMLElement, snapshot: SectionDomSnapshot): void {
  const main = root.querySelector<HTMLElement>('.main');
  if (main) main.scrollTop = snapshot.mainScrollTop;
  if (window.scrollX !== snapshot.windowScroll.x || window.scrollY !== snapshot.windowScroll.y) {
    window.scrollTo(snapshot.windowScroll.x, snapshot.windowScroll.y);
  }

  const active = snapshot.activePath ? nodeFromPath(root, snapshot.activePath) : null;
  if (active instanceof HTMLElement) {
    active.focus({ preventScroll: true });
    if (
      snapshot.inputSelection &&
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
    ) {
      active.setSelectionRange(
        snapshot.inputSelection.start,
        snapshot.inputSelection.end,
        snapshot.inputSelection.direction ?? undefined
      );
    }
  }

  if (!snapshot.selection) return;
  const anchor = nodeFromPath(root, snapshot.selection.anchorPath);
  const focus = nodeFromPath(root, snapshot.selection.focusPath);
  const selection = window.getSelection?.();
  if (!anchor || !focus || !selection) return;
  selection.removeAllRanges();
  selection.setBaseAndExtent(
    anchor,
    Math.min(snapshot.selection.anchorOffset, anchor.textContent?.length ?? 0),
    focus,
    Math.min(snapshot.selection.focusOffset, focus.textContent?.length ?? 0)
  );
}

function normalizeRequest(request: SectionInvalidationRequest): SectionInvalidationScope[] {
  const scopes = typeof request === 'string' ? [request] : [...request];
  if (!scopes.length) throw new Error('SECTION_INVALIDATION_SCOPE_REQUIRED');
  scopes.forEach((scope) => {
    if (!VALID_SCOPES.has(scope)) throw new Error(`UNKNOWN_SECTION_INVALIDATION_SCOPE:${scope}`);
  });
  return scopes;
}

export function createSectionInvalidationOwner(options: {
  handlers: Partial<Record<SectionInvalidationScope, () => void>>;
  capture?(): SectionDomSnapshot;
  restore?(snapshot: SectionDomSnapshot): void;
}): SectionInvalidationOwner {
  let active = true;
  let applying = false;
  const pending = new Set<SectionInvalidationScope>();

  function invalidate(request: SectionInvalidationRequest): void {
    if (!active) return;
    normalizeRequest(request).forEach((scope) => {
      if (scope === 'all-invariant-recovery') pending.clear();
      if (!pending.has('all-invariant-recovery')) pending.add(scope);
    });
    if (applying) return;
    applying = true;
    try {
      while (active && pending.size) {
        const scopes = new Set(pending);
        pending.clear();
        const snapshot = options.capture?.();
        if (scopes.has('all-invariant-recovery')) {
          options.handlers['all-invariant-recovery']?.();
        } else if (scopes.has('locale-schema')) {
          options.handlers['locale-schema']?.();
        } else {
          scopes.forEach((scope) => options.handlers[scope]?.());
        }
        if (snapshot) options.restore?.(snapshot);
      }
    } catch (error) {
      pending.clear();
      throw error;
    } finally {
      applying = false;
    }
  }

  return {
    get active() {
      return active;
    },
    dispose() {
      active = false;
      pending.clear();
    },
    invalidate
  };
}
