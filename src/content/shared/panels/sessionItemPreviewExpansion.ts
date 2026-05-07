const TEXT_PREVIEW_SELECTOR = '.session-item-primary-line';
const EXPANDED_CLASS = 'is-expanded';

function setExpanded(element: HTMLElement, expanded: boolean): void {
  element.classList.toggle(EXPANDED_CLASS, expanded);
  element.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function collapseAll(surface: HTMLElement, except?: HTMLElement): void {
  surface.querySelectorAll<HTMLElement>(TEXT_PREVIEW_SELECTOR).forEach((element) => {
    if (element !== except) {
      setExpanded(element, false);
    }
  });
}

export function bindSessionItemPreviewExpansion(surface: HTMLElement): () => void {
  const previews = Array.from(surface.querySelectorAll<HTMLElement>(TEXT_PREVIEW_SELECTOR));

  previews.forEach((element) => {
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    setExpanded(element, false);
  });

  const togglePreview = (target: HTMLElement): void => {
    const nextExpanded = !target.classList.contains(EXPANDED_CLASS);
    collapseAll(surface, target);
    setExpanded(target, nextExpanded);
  };

  const handlePreviewClick = (event: Event): void => {
    const preview = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!preview) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    togglePreview(preview);
  };

  const handleSurfaceClick = (): void => {
    collapseAll(surface);
  };

  const handlePreviewKeydown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const preview = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!preview) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    togglePreview(preview);
  };

  const handleDocumentClick = (): void => {
    collapseAll(surface);
  };

  previews.forEach((element) => {
    element.addEventListener('click', handlePreviewClick);
    element.addEventListener('keydown', handlePreviewKeydown);
  });
  surface.addEventListener('click', handleSurfaceClick, true);
  document.addEventListener('click', handleDocumentClick);

  return () => {
    previews.forEach((element) => {
      element.removeEventListener('click', handlePreviewClick);
      element.removeEventListener('keydown', handlePreviewKeydown);
    });
    surface.removeEventListener('click', handleSurfaceClick, true);
    document.removeEventListener('click', handleDocumentClick);
  };
}
