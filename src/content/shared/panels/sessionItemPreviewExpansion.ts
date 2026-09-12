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

export function prepareSessionItemPreviews(surface: HTMLElement): void {
  surface.querySelectorAll<HTMLElement>(TEXT_PREVIEW_SELECTOR).forEach((element) => {
    if (element.hasAttribute('role')) return;
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    setExpanded(element, false);
  });
}

export function bindSessionItemPreviewExpansion(surface: HTMLElement): () => void {
  prepareSessionItemPreviews(surface);

  const resolvePreview = (event: Event): HTMLElement | null => {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest<HTMLElement>(TEXT_PREVIEW_SELECTOR) ?? null;
  };

  const togglePreview = (target: HTMLElement): void => {
    const nextExpanded = !target.classList.contains(EXPANDED_CLASS);
    collapseAll(surface, target);
    setExpanded(target, nextExpanded);
  };

  const handleSurfaceClick = (event: Event): void => {
    prepareSessionItemPreviews(surface);
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.reader-surface-window.is-collapsed,.video-surface-window.is-collapsed')) {
      return;
    }
    const preview = resolvePreview(event);
    if (!preview) {
      collapseAll(surface);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    togglePreview(preview);
  };

  const handleSurfaceKeydown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) return;
    const preview = resolvePreview(event);
    if (!preview) return;
    event.preventDefault();
    event.stopPropagation();
    togglePreview(preview);
  };

  const handleDocumentClick = (event: Event): void => {
    if (event.composedPath().includes(surface)) return;
    collapseAll(surface);
  };

  surface.addEventListener('click', handleSurfaceClick, true);
  surface.addEventListener('keydown', handleSurfaceKeydown);
  document.addEventListener('click', handleDocumentClick);

  return () => {
    surface.removeEventListener('click', handleSurfaceClick, true);
    surface.removeEventListener('keydown', handleSurfaceKeydown);
    document.removeEventListener('click', handleDocumentClick);
  };
}
