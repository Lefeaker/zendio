import { clipperStyleSheetManager } from '../shared/styleSheetManager';

export type ClipperDialogHostParts = {
  host: HTMLDivElement;
  shadowRoot: ShadowRoot;
};

export async function mountClipperDialogHost(
  surface: HTMLElement
): Promise<ClipperDialogHostParts> {
  await clipperStyleSheetManager.initialize();

  const host = document.createElement('div');
  host.id = 'obsidian-clipper-dialog';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.dataset.aiobPanelTheme = 'tool';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';

  const shadowRoot = host.attachShadow({ mode: 'open' });
  clipperStyleSheetManager.applyStitchRuntimeStyles(shadowRoot);
  shadowRoot.append(surface);
  document.body.append(host);
  document.documentElement.dataset.aiobClipperDialog = 'open';

  return { host, shadowRoot };
}

export function unmountClipperDialogHost(host: HTMLElement | null): void {
  host?.remove();
  delete document.documentElement.dataset.aiobClipperDialog;
}
