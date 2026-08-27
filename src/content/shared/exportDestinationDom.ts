import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime';

function findDestinationRow(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('.export-destination-row');
}

function findDestinationButton(row: HTMLElement, id: string): HTMLButtonElement | null {
  const buttons = Array.from(
    row.querySelectorAll<HTMLButtonElement>('.export-destination-option[data-destination-id]')
  );
  return buttons.find((button) => button.dataset.destinationId === id) ?? null;
}

function syncText(row: HTMLElement, selector: string, value: string): boolean {
  const element = row.querySelector<HTMLElement>(selector);
  if (!element) {
    return false;
  }
  element.textContent = value;
  return true;
}

function syncSetupLink(row: HTMLElement, destination: ExportDestinationSurfacePreview): boolean {
  const existing = row.querySelector<HTMLAnchorElement>('.export-destination-setup-link');
  if (destination.hasConfiguredVault || !destination.setupUrl) {
    existing?.remove();
    return true;
  }

  if (existing) {
    existing.href = destination.setupUrl;
    return existing.textContent?.trim().length !== 0;
  }

  return false;
}

export function patchExportDestinationRow(
  root: ParentNode,
  destination: ExportDestinationSurfacePreview | undefined
): boolean {
  const row = findDestinationRow(root);
  if (!destination) {
    row?.remove();
    return Boolean(row);
  }
  if (!row) {
    return false;
  }

  const buttons = Array.from(
    row.querySelectorAll<HTMLButtonElement>('.export-destination-option[data-destination-id]')
  );
  if (buttons.length !== destination.options.length) {
    return false;
  }
  if (destination.options.some((option) => !findDestinationButton(row, option.id))) {
    return false;
  }

  if (!syncText(row, '.export-destination-label', destination.label)) {
    return false;
  }
  if (!syncText(row, '.export-destination-path', destination.path)) {
    return false;
  }

  for (const option of destination.options) {
    const button = findDestinationButton(row, option.id);
    if (!button) {
      return false;
    }
    button.classList.toggle('is-selected', option.selected);
    syncText(button, '.export-destination-option-label', option.label);
    syncText(button, '.export-destination-option-path', option.path);
  }

  row.querySelector<HTMLDetailsElement>('.export-destination-menu')?.removeAttribute('open');
  return syncSetupLink(row, destination);
}

export function reconcileExportDestinationRow(currentRoot: ParentNode, nextRoot: ParentNode): void {
  const current = findDestinationRow(currentRoot);
  const next = findDestinationRow(nextRoot);
  if (!next) {
    current?.remove();
    return;
  }
  if (current) {
    if (patchDestinationTemplate(current, next)) return;
    current.replaceWith(next.cloneNode(true));
    return;
  }
  const footer = currentRoot.querySelector<HTMLElement>('.surface-window-footer');
  footer?.before(next.cloneNode(true));
}

function patchDestinationTemplate(current: HTMLElement, next: HTMLElement): boolean {
  const currentButtons = Array.from(
    current.querySelectorAll<HTMLButtonElement>('[data-destination-id]')
  );
  const nextButtons = Array.from(next.querySelectorAll<HTMLButtonElement>('[data-destination-id]'));
  if (
    currentButtons.length !== nextButtons.length ||
    nextButtons.some(
      (button) =>
        !currentButtons.some(
          (currentButton) => currentButton.dataset.destinationId === button.dataset.destinationId
        )
    )
  ) {
    return false;
  }
  syncText(
    current,
    '.export-destination-eyebrow',
    next.querySelector('.export-destination-eyebrow')?.textContent ?? ''
  );
  syncText(
    current,
    '.export-destination-label',
    next.querySelector('.export-destination-label')?.textContent ?? ''
  );
  syncText(
    current,
    '.export-destination-path',
    next.querySelector('.export-destination-path')?.textContent ?? ''
  );
  nextButtons.forEach((nextButton) => {
    const currentButton = currentButtons.find(
      (button) => button.dataset.destinationId === nextButton.dataset.destinationId
    );
    if (!currentButton) return;
    currentButton.className = nextButton.className;
    syncText(
      currentButton,
      '.export-destination-option-label',
      nextButton.querySelector('.export-destination-option-label')?.textContent ?? ''
    );
    syncText(
      currentButton,
      '.export-destination-option-path',
      nextButton.querySelector('.export-destination-option-path')?.textContent ?? ''
    );
  });
  const currentLink = current.querySelector<HTMLAnchorElement>('.export-destination-setup-link');
  const nextLink = next.querySelector<HTMLAnchorElement>('.export-destination-setup-link');
  if (!nextLink) currentLink?.remove();
  else if (currentLink) {
    currentLink.href = nextLink.href;
    currentLink.textContent = nextLink.textContent;
  } else current.append(nextLink.cloneNode(true));
  return true;
}
