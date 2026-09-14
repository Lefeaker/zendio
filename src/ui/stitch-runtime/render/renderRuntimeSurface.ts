import type { RuntimeSchemaContext, RuntimeViewSchema } from '../contracts/schema';
import { resolveRuntimeValue } from './actionAdapter';
import { renderRuntimeNodeList, type RuntimeNodeRendererContext } from './nodeRenderers';

export type RuntimeSessionSurfaceId = 'reader' | 'video';

export interface RuntimeSessionPresentation {
  collapsed: boolean;
  expandLabel: string;
  collapseLabel: string;
}

export interface RuntimeSurfaceHandle {
  readonly root: HTMLElement;
  readonly dialog: HTMLElement;
  readonly sessionModal: HTMLElement;
  readonly sessionWindow: HTMLElement;
  readonly collapseTrigger: HTMLButtonElement;
  readonly itemList: HTMLElement;
  readonly status: HTMLElement;
  patchChrome(nextRoot: HTMLElement): void;
  updateSessionPresentation(presentation: RuntimeSessionPresentation): void;
  dispose(): void;
}

export function renderRuntimeSurface<
  TContext extends RuntimeSchemaContext<unknown, unknown>,
  TExtensionNode extends { kind: string } = never
>(
  view: RuntimeViewSchema<TContext, TExtensionNode>,
  ctx: RuntimeNodeRendererContext<TContext, TExtensionNode>
): HTMLElement {
  const placement = resolveRuntimeValue(view.surfacePlacement, ctx) ?? 'dialog';
  const skin = resolveRuntimeValue(view.surfaceSkin, ctx);
  const isNonModalSurface = placement === 'side-right' || placement === 'floating-bottom-right';
  if (view.kind === 'standalone-page') {
    return ctx.el(
      'section',
      { className: view.className, dataset: view.dataset },
      renderRuntimeNodeList(view.children, ctx)
    );
  }
  return ctx.el(
    'div',
    {
      className: [
        'resource-modal-overlay',
        placement === 'side-right' ? 'resource-modal-overlay side-right' : '',
        placement === 'floating-bottom-right' ? 'resource-modal-overlay floating-bottom-right' : '',
        skin ? `resource-modal-overlay--${skin}` : ''
      ]
        .filter(Boolean)
        .join(' '),
      onClick: () => ctx.dispatch('resource:close')
    },
    ctx.el(
      'div',
      {
        className: [
          'resource-modal',
          resolveRuntimeValue(view.size, ctx) ?? 'medium',
          placement === 'side-right' ? 'side-right' : '',
          placement === 'floating-bottom-right' ? 'floating-bottom-right' : '',
          skin ? `resource-modal--${skin}` : ''
        ]
          .filter(Boolean)
          .join(' '),
        role: 'dialog',
        'aria-modal': isNonModalSurface ? 'false' : 'true',
        onClick: (event: MouseEvent) => event.stopPropagation()
      },
      ctx.el(
        'div',
        { className: 'resource-modal-header' },
        ctx.el(
          'div',
          { className: 'resource-modal-headings' },
          ctx.el('h2', { text: resolveRuntimeValue(view.title, ctx) }),
          resolveRuntimeValue(view.description, ctx)
            ? ctx.el('p', { text: resolveRuntimeValue(view.description, ctx) })
            : null
        )
      ),
      ctx.el('div', { className: 'resource-modal-body' }, renderRuntimeNodeList(view.children, ctx))
    )
  );
}

export function createRuntimeSurfaceHandle(
  root: HTMLElement,
  surfaceId: RuntimeSessionSurfaceId,
  onDispose: () => void = () => undefined
): RuntimeSurfaceHandle {
  const dialog = requireElement(root, '[role="dialog"]');
  const sessionModal = requireElement(root, '.resource-modal--session');
  const sessionWindow = requireElement(
    root,
    surfaceId === 'reader' ? '.reader-surface-window' : '.video-surface-window'
  );
  const collapseTrigger = requireElement<HTMLButtonElement>(
    root,
    '[data-action-id="session:toggleCollapse"]'
  );
  const itemList = requireElement(root, '.session-item-list');
  const status = requireElement(root, '.surface-window-subtitle');
  let disposed = false;

  root.style.pointerEvents = 'none';
  dialog.style.pointerEvents = 'auto';
  sessionWindow.style.pointerEvents = 'auto';
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('role', 'status');
  status.dataset.sessionStatus = 'true';
  if (surfaceId === 'reader') dialog.dataset.role = 'dialog-title';
  else dialog.dataset.element = 'dialog';
  if (surfaceId === 'reader') {
    root
      .querySelector<HTMLElement>('[data-action-id="reader:finish"]')
      ?.setAttribute('data-role', 'export-btn');
    root
      .querySelector<HTMLElement>('[data-action-id="reader:cancel"]')
      ?.setAttribute('data-role', 'close-btn');
  }

  return {
    root,
    dialog,
    sessionModal,
    sessionWindow,
    collapseTrigger,
    itemList,
    status,
    patchChrome(nextRoot) {
      patchNamedElement(root, nextRoot, '.surface-window-icon-image');
      patchNamedElement(root, nextRoot, '.surface-window-title');
      patchNamedElement(root, nextRoot, '.surface-window-subtitle');
      patchNamedElement(root, nextRoot, '[data-session-status]');
      patchNamedElement(root, nextRoot, '.session-counter');
      patchNamedElement(root, nextRoot, '.session-first-use-guide-title');
      patchNamedElement(root, nextRoot, '.session-first-use-guide-resize');
      patchNamedElement(root, nextRoot, '.session-first-use-guide-settings');
      patchActionElements(root, nextRoot);
    },
    updateSessionPresentation({ collapsed, expandLabel, collapseLabel }) {
      sessionModal.classList.toggle('is-collapsed', collapsed);
      sessionWindow.classList.toggle('is-collapsed', collapsed);
      collapseTrigger.hidden = collapsed;
      collapseTrigger.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      collapseTrigger.setAttribute('aria-label', collapsed ? expandLabel : collapseLabel);
      collapseTrigger.textContent = collapsed ? '⌃' : '⌄';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      onDispose();
    }
  };
}

function requireElement<TElement extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string
): TElement {
  const element = root.querySelector<TElement>(selector);
  if (!element) throw new Error(`Runtime session surface is missing ${selector}`);
  return element;
}

function patchNamedElement(currentRoot: ParentNode, nextRoot: ParentNode, selector: string): void {
  const current = currentRoot.querySelector<HTMLElement>(selector);
  const next = nextRoot.querySelector<HTMLElement>(selector);
  if (!current || !next) return;
  syncAttributes(current, next);
  if (!(current instanceof HTMLInputElement) && current.textContent !== next.textContent) {
    current.textContent = next.textContent;
  }
}

function patchActionElements(currentRoot: ParentNode, nextRoot: ParentNode): void {
  nextRoot.querySelectorAll<HTMLElement>('[data-action-id]').forEach((next) => {
    if (next.closest('.export-destination-row')) return;
    const actionId = next.dataset.actionId;
    if (!actionId) return;
    const current = Array.from(currentRoot.querySelectorAll<HTMLElement>('[data-action-id]')).find(
      (candidate) =>
        candidate.dataset.actionId === actionId && !candidate.closest('.export-destination-row')
    );
    if (!current || current.closest('[data-highlight-id],[data-capture-id]')) return;
    syncAttributes(current, next);
    if (current.textContent !== next.textContent) current.textContent = next.textContent;
  });
}

function syncAttributes(current: HTMLElement, next: HTMLElement): void {
  Array.from(current.attributes).forEach((attribute) => {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  });
  Array.from(next.attributes).forEach((attribute) => {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  });
}
