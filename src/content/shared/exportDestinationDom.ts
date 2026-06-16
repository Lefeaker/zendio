import type { ExportDestinationSurfacePreview } from '@options/stitch/types';

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
