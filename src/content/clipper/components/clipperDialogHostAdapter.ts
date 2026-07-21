import type { StyleAttachmentHandle } from '@ui/foundation/style-host';
import { clipperStyleSheetManager } from '../shared/styleSheetManager';

const CLIPPER_DIALOG_HOST_LIFECYCLE = Symbol('clipperDialogHostLifecycle');

type ClipperDialogHostLifecycle = {
  styleAttachment: StyleAttachmentHandle;
  mountToken: HostMountToken;
  disposed: boolean;
};

type ManagedClipperDialogHost = HTMLDivElement & {
  [CLIPPER_DIALOG_HOST_LIFECYCLE]: ClipperDialogHostLifecycle;
};

export type ClipperDialogHostParts = {
  host: HTMLDivElement;
  shadowRoot: ShadowRoot;
};

export type HostMountToken = { valid: boolean };
let activeMountToken: HostMountToken | null = null;

export function reserveHostMount(): HostMountToken {
  if (activeMountToken) activeMountToken.valid = false;
  const token = { valid: true };
  activeMountToken = token;
  return token;
}

export function cancelHostMount(token: HostMountToken | null): void {
  if (!token) return;
  token.valid = false;
  if (activeMountToken === token) activeMountToken = null;
}

export async function mountClipperDialogHost(
  surface: HTMLElement,
  mountToken: HostMountToken
): Promise<ClipperDialogHostParts | null> {
  await clipperStyleSheetManager.initialize();
  if (!mountToken.valid || activeMountToken !== mountToken) return null;

  const host = document.createElement('div');
  host.id = 'obsidian-clipper-dialog';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.dataset.aiobPanelTheme = 'tool';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const styleAttachment = clipperStyleSheetManager.applyStitchRuntimeStyles(shadowRoot);
  Object.defineProperty(host, CLIPPER_DIALOG_HOST_LIFECYCLE, {
    value: { styleAttachment, mountToken, disposed: false } satisfies ClipperDialogHostLifecycle
  });
  shadowRoot.append(surface);
  document.body.append(host);
  document.documentElement.dataset.aiobClipperDialog = 'open';

  return { host, shadowRoot };
}

export function unmountClipperDialogHost(host: HTMLElement | null): void {
  if (!host) return;
  if (!(CLIPPER_DIALOG_HOST_LIFECYCLE in host)) {
    throw new Error('Clipper dialog host lifecycle is missing');
  }
  const lifecycle = (host as ManagedClipperDialogHost)[CLIPPER_DIALOG_HOST_LIFECYCLE];
  const isCurrentHost = document.getElementById('obsidian-clipper-dialog') === host;
  cancelHostMount(lifecycle.mountToken);
  if (!lifecycle.disposed) {
    lifecycle.disposed = true;
    lifecycle.styleAttachment.dispose();
  }
  host.remove();
  if (isCurrentHost) delete document.documentElement.dataset.aiobClipperDialog;
}
