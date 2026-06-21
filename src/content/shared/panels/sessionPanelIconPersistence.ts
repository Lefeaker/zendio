const SESSION_PANEL_ICON_SELECTOR = '.surface-window-icon-image';

function copyImagePresentationAttributes(source: HTMLImageElement, target: HTMLImageElement): void {
  const className = target.getAttribute('class');
  if (className === null) {
    source.removeAttribute('class');
  } else {
    source.setAttribute('class', className);
  }

  const alt = target.getAttribute('alt');
  if (alt === null) {
    source.removeAttribute('alt');
  } else {
    source.setAttribute('alt', alt);
  }
}

export function preserveSessionPanelIcon(currentRoot: ParentNode, nextSurface: HTMLElement): void {
  const currentIcon = currentRoot.querySelector<HTMLImageElement>(SESSION_PANEL_ICON_SELECTOR);
  const nextIcon = nextSurface.querySelector<HTMLImageElement>(SESSION_PANEL_ICON_SELECTOR);
  if (!currentIcon || !nextIcon) {
    return;
  }

  if (currentIcon.getAttribute('src') !== nextIcon.getAttribute('src')) {
    return;
  }

  copyImagePresentationAttributes(currentIcon, nextIcon);
  nextIcon.replaceWith(currentIcon);
}
