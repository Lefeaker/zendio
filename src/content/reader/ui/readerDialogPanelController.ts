import { bindSessionPanelFirstUseGuide } from '@content/shared/panels/sessionPanelFirstUseGuide';
import { refreshSessionPanelRecovery } from '@content/shared/panels/sessionPanelRecovery';
import type { RuntimeSurfaceHandle } from '@content/stitch/runtimeSurfaceRenderer';
import type { StyleAttachmentHandle } from '@ui/foundation/style-host';
import type { PopupCoordinator } from '@content/runtime/popupCoordinator';
import { createInvalidationScope } from '@ui/stitch-runtime/render/invalidation';
import { reconcileExportDestinationRow } from '@content/shared/exportDestinationDom';
import {
  bindSessionItemPreviewExpansion,
  prepareSessionItemPreviews
} from '@content/shared/panels/sessionItemPreviewExpansion';
import { bindSessionPanelResize } from '@content/shared/panels/sessionPanelResize';
import { preserveSessionPanelIcon } from '@content/shared/panels/sessionPanelIconPersistence';
import {
  createKeyedSessionList,
  patchSessionElement,
  type KeyedSessionList
} from '@ui/stitch-runtime/render/keyedSessionList';
import {
  bindReaderDialogPanelEvents,
  type ReaderDialogPanelEventHandlers
} from './readerDialogPanelEvents';

interface ReaderItemTemplate {
  id: string;
  element: HTMLElement;
}

export interface ReaderDialogPanelControllerOptions {
  host: HTMLElement;
  shadow: ShadowRoot;
  popupOwner: Parameters<PopupCoordinator['register']>[0];
  popupCoordinator: PopupCoordinator | null;
  applyStyles(root: ShadowRoot): StyleAttachmentHandle;
  revealStyles(root: HTMLElement, handle: StyleAttachmentHandle): Promise<boolean>;
  createHandle(): RuntimeSurfaceHandle;
  createTemplate(): HTMLElement;
  isCollapsed(): boolean;
  events: ReaderDialogPanelEventHandlers;
}

export class ReaderDialogPanelController {
  readonly handle: RuntimeSurfaceHandle;
  private readonly items: KeyedSessionList<ReaderItemTemplate>;
  private readonly disposeEvents: () => void;
  private readonly disposeFirstUseGuide: () => void;
  private readonly disposeResize: () => void;
  private readonly disposePreviewExpansion: () => void;
  private readonly invalidation = createInvalidationScope();
  private styleAttachment: StyleAttachmentHandle | null = null;
  private unregisterPopup: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly options: ReaderDialogPanelControllerOptions) {
    this.handle = options.createHandle();
    options.shadow.replaceChildren(this.handle.root);
    const initial = collectItems(this.handle.itemList);
    this.items = createKeyedSessionList({
      container: this.handle.itemList,
      keyOf: (item) => item.id,
      create: (item) => item.element.cloneNode(true) as HTMLElement,
      update: (element, item) => patchSessionElement(element, item.element),
      initial: initial.map((item) => ({ key: item.id, element: item.element }))
    });
    this.disposeEvents = bindReaderDialogPanelEvents(this.handle, options.events);
    this.disposeFirstUseGuide = bindSessionPanelFirstUseGuide(this.handle.root, 'reader');
    this.disposeResize = bindSessionPanelResize(this.handle.root);
    this.disposePreviewExpansion = bindSessionItemPreviewExpansion(this.handle.root);
    this.applyPresentation(this.handle.root);
    const attachment = options.applyStyles(options.shadow);
    this.styleAttachment = attachment;
    const token = this.invalidation.capture();
    void options.revealStyles(options.host, attachment).then((ready) => {
      if (!this.invalidation.isCurrent(token) || this.styleAttachment !== attachment) return;
      if (!ready) this.dispose();
    });
  }

  mount(target: HTMLElement = document.body): HTMLElement {
    if (!this.options.host.isConnected) target.append(this.options.host);
    return this.options.host;
  }

  show(): void {
    this.options.host.dataset.aiobStyleReveal = 'true';
    this.mount();
    if (!this.options.host.hasAttribute('aria-busy')) this.options.host.hidden = false;
    if (!this.unregisterPopup && this.options.popupCoordinator) {
      this.unregisterPopup = this.options.popupCoordinator.register(this.options.popupOwner);
    }
  }

  hide(): void {
    delete this.options.host.dataset.aiobStyleReveal;
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.options.host.hidden = true;
  }

  update(): void {
    if (this.disposed) return;
    const nextRoot = this.options.createTemplate();
    preserveSessionPanelIcon(this.handle.root, nextRoot);
    this.handle.patchChrome(nextRoot);
    reconcileExportDestinationRow(this.handle.root, nextRoot);
    this.items.reconcile(collectItems(requireItemList(nextRoot)));
    prepareSessionItemPreviews(this.handle.root);
    this.applyPresentation(nextRoot);
    refreshSessionPanelRecovery(this.options.host.ownerDocument, 'reader');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidation.dispose();
    this.unregisterPopup?.();
    this.unregisterPopup = null;
    this.disposePreviewExpansion();
    this.disposeFirstUseGuide();
    this.disposeResize();
    this.disposeEvents();
    this.items.dispose();
    this.handle.dispose();
    const attachment = this.styleAttachment;
    this.styleAttachment = null;
    attachment?.dispose();
    this.options.host.remove();
  }

  private applyPresentation(source: HTMLElement): void {
    this.handle.updateSessionPresentation({
      collapsed: this.options.isCollapsed(),
      expandLabel: source.dataset.expandPanelLabel ?? 'Expand panel',
      collapseLabel: source.dataset.collapsePanelLabel ?? 'Collapse panel'
    });
  }
}

function requireItemList(root: ParentNode): HTMLElement {
  const list = root.querySelector<HTMLElement>('.session-item-list');
  if (!list) throw new Error('Reader session surface is missing the item list');
  return list;
}

function collectItems(list: HTMLElement): ReaderItemTemplate[] {
  return Array.from(list.children).flatMap((element) => {
    if (!(element instanceof HTMLElement)) return [];
    const id = element.dataset.highlightId;
    return id ? [{ id, element }] : [];
  });
}
