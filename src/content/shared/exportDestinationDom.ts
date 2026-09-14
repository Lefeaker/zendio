import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime';
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeSurfaceFallbackMessages';
import { createContentI18nTranslator, getContentI18nResource } from '@content/i18n/context';

type DestinationOptionPatch = {
  id: string;
  label: string;
  path: string;
  className: string;
  source?: HTMLButtonElement;
};
function findDestinationRow(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('.export-destination-row');
}
function syncText(
  root: HTMLElement,
  selector: string,
  value: string,
  withTooltip = false
): boolean {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) return false;
  element.textContent = value;
  if (withTooltip) element.title = value;
  return true;
}
function getActiveElement(row: HTMLElement): Element | null {
  const root = row.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null;
}
function captureInteraction(row: HTMLElement) {
  const details = row.querySelector<HTMLDetailsElement>('.export-destination-menu');
  const summary = details?.querySelector<HTMLElement>('.export-destination-summary');
  if (!details || !summary) return null;
  const active = getActiveElement(row);
  const focusedOption =
    active instanceof HTMLButtonElement &&
    row.contains(active) &&
    active.classList.contains('export-destination-option')
      ? active
      : null;
  return {
    details,
    summary,
    focusedOption,
    focusedByKeyboard: focusedOption?.matches(':focus-visible') ?? false
  };
}
function hasOptionContent(button: HTMLButtonElement): boolean {
  return Boolean(
    button.querySelector('.export-destination-option-label') &&
    button.querySelector('.export-destination-option-path')
  );
}
function syncOption(button: HTMLButtonElement, option: DestinationOptionPatch): boolean {
  button.className = option.className;
  button.dataset.destinationId = option.id;
  if (option.source) {
    button.type = option.source.type;
    button.disabled = option.source.disabled;
    const actionId = option.source.dataset.actionId;
    if (actionId) button.dataset.actionId = actionId;
    else delete button.dataset.actionId;
  }
  return (
    syncText(button, '.export-destination-option-label', option.label) &&
    syncText(button, '.export-destination-option-path', option.path, true)
  );
}
function reconcileOptions(
  row: HTMLElement,
  options: DestinationOptionPatch[],
  closeOnActivation: boolean,
  selectionActivated = false
): boolean {
  const ids = options.map((option) => option.id);
  if (ids.length === 0 || new Set(ids).size !== ids.length) return false;
  const interaction = captureInteraction(row);
  const container = row.querySelector<HTMLElement>('.export-destination-options');
  if (!interaction || !container) return false;
  const currentButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.export-destination-option')
  );
  const fallback = currentButtons.find(hasOptionContent);
  const buttonsById = new Map<string, HTMLButtonElement[]>();
  currentButtons.forEach((button) => {
    const id = button.dataset.destinationId;
    if (!id) return;
    const matches = buttonsById.get(id) ?? [];
    matches.push(button);
    buttonsById.set(id, matches);
  });
  const desiredButtons: HTMLButtonElement[] = [];
  for (const option of options) {
    let button = buttonsById.get(option.id)?.shift();
    if (!button || !hasOptionContent(button)) {
      const source = option.source ?? fallback;
      if (!source || !hasOptionContent(source)) return false;
      button = source.cloneNode(true) as HTMLButtonElement;
    }
    if (!syncOption(button, option)) return false;
    desiredButtons.push(button);
  }
  const desired = new Set(desiredButtons);
  currentButtons.forEach((button) => {
    if (!desired.has(button)) button.remove();
  });
  desiredButtons.forEach((button, index) => {
    const current = container.children.item(index);
    if (current !== button) container.insertBefore(button, current);
  });
  const focusedRetained = interaction.focusedOption ? desired.has(interaction.focusedOption) : true;
  if (
    interaction.focusedOption &&
    focusedRetained &&
    getActiveElement(row) !== interaction.focusedOption
  ) {
    interaction.focusedOption.focus({ preventScroll: true });
  }
  const focusedRemoved = Boolean(interaction.focusedOption && !focusedRetained);
  if ((closeOnActivation && selectionActivated) || focusedRemoved) {
    interaction.details.removeAttribute('open');
  }
  if (
    focusedRemoved ||
    (closeOnActivation && selectionActivated && interaction.focusedByKeyboard)
  ) {
    interaction.summary.focus({ preventScroll: true });
  }
  return true;
}
function syncSetupLinkFromPreview(
  row: HTMLElement,
  destination: ExportDestinationSurfacePreview
): boolean {
  const link = row.querySelector<HTMLAnchorElement>('.export-destination-setup-link');
  if (destination.hasConfiguredVault || !destination.setupUrl) {
    link?.remove();
    return true;
  }
  if (!link) {
    const fallback = RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceConfigureVaultLabel;
    const translate = createContentI18nTranslator(getContentI18nResource());
    const created = row.ownerDocument.createElement('a');
    created.className = 'export-destination-setup-link';
    created.href = destination.setupUrl;
    created.target = '_blank';
    created.rel = 'noopener noreferrer';
    created.textContent =
      translate?.('schemaRuntimeSurfaceConfigureVaultLabel', fallback) ?? fallback;
    row.append(created);
    return created.textContent.trim().length !== 0;
  }
  link.href = destination.setupUrl;
  return link.textContent?.trim().length !== 0;
}
function syncSetupLinkFromTemplate(row: HTMLElement, next: HTMLElement): void {
  const currentLink = row.querySelector<HTMLAnchorElement>('.export-destination-setup-link');
  const nextLink = next.querySelector<HTMLAnchorElement>('.export-destination-setup-link');
  if (!nextLink) currentLink?.remove();
  else if (currentLink) {
    currentLink.className = nextLink.className;
    currentLink.href = nextLink.href;
    currentLink.target = nextLink.target;
    currentLink.rel = nextLink.rel;
    currentLink.textContent = nextLink.textContent;
  } else row.append(nextLink.cloneNode(true));
}

export function patchExportDestinationRow(
  root: ParentNode,
  destination: ExportDestinationSurfacePreview | undefined,
  selectionActivated = false
): boolean {
  const row = findDestinationRow(root);
  if (!destination) {
    row?.remove();
    return Boolean(row);
  }
  if (
    !row ||
    !syncText(row, '.export-destination-label', destination.label) ||
    !syncText(row, '.export-destination-path', destination.path, true)
  ) {
    return false;
  }
  const patched = reconcileOptions(
    row,
    destination.options.map((option) => ({
      id: option.id,
      label: option.label,
      path: option.path,
      className: ['export-destination-option', option.selected ? 'is-selected' : '']
        .filter(Boolean)
        .join(' ')
    })),
    true,
    selectionActivated
  );
  return patched && syncSetupLinkFromPreview(row, destination);
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
  currentRoot.querySelector<HTMLElement>('.surface-window-footer')?.before(next.cloneNode(true));
}

function patchDestinationTemplate(current: HTMLElement, next: HTMLElement): boolean {
  const options = Array.from(
    next.querySelectorAll<HTMLButtonElement>('.export-destination-option[data-destination-id]')
  ).flatMap((button) => {
    const id = button.dataset.destinationId;
    if (!id) return [];
    return [
      {
        id,
        label: button.querySelector('.export-destination-option-label')?.textContent ?? '',
        path: button.querySelector('.export-destination-option-path')?.textContent ?? '',
        className: button.className,
        source: button
      }
    ];
  });
  if (
    !syncText(
      current,
      '.export-destination-eyebrow',
      next.querySelector('.export-destination-eyebrow')?.textContent ?? ''
    ) ||
    !syncText(
      current,
      '.export-destination-label',
      next.querySelector('.export-destination-label')?.textContent ?? ''
    ) ||
    !syncText(
      current,
      '.export-destination-path',
      next.querySelector('.export-destination-path')?.textContent ?? '',
      true
    ) ||
    !reconcileOptions(current, options, false)
  ) {
    return false;
  }
  syncSetupLinkFromTemplate(current, next);
  return true;
}
