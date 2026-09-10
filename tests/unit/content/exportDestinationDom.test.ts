/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  patchExportDestinationRow,
  reconcileExportDestinationRow
} from '@content/shared/exportDestinationDom';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';

function createDestination(
  overrides: Partial<ExportDestinationSurfacePreview> = {}
): ExportDestinationSurfacePreview {
  return {
    id: 'downloads',
    kind: 'downloads',
    label: 'Downloads',
    path: 'Downloads/clip.md',
    hasConfiguredVault: false,
    setupUrl: 'https://example.com/setup',
    options: [
      {
        id: 'downloads',
        kind: 'downloads',
        label: 'Downloads',
        path: 'Downloads/clip.md',
        selected: true
      }
    ],
    ...overrides
  };
}

function createRow(options?: {
  setupLabel?: string;
  includeLink?: boolean;
  includeVaultOption?: boolean;
}): HTMLElement {
  const root = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'export-destination-row';

  const details = document.createElement('details');
  details.className = 'export-destination-menu';

  const summary = document.createElement('summary');
  summary.className = 'export-destination-summary';

  const copy = document.createElement('div');
  copy.className = 'export-destination-copy';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'export-destination-eyebrow';
  eyebrow.textContent = 'Save to';

  const label = document.createElement('strong');
  label.className = 'export-destination-label';
  label.textContent = 'Downloads';

  const path = document.createElement('span');
  path.className = 'export-destination-path';
  path.textContent = 'Downloads/clip.md';

  copy.append(eyebrow, label, path);
  summary.appendChild(copy);
  details.appendChild(summary);

  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'export-destination-options';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'export-destination-option is-selected';
  button.dataset.destinationId = 'downloads';
  const buttonLabel = document.createElement('span');
  buttonLabel.className = 'export-destination-option-label';
  buttonLabel.textContent = 'Downloads';
  const buttonPath = document.createElement('span');
  buttonPath.className = 'export-destination-option-path';
  buttonPath.textContent = 'Downloads/clip.md';
  button.append(buttonLabel, buttonPath);
  optionsContainer.appendChild(button);
  if (options?.includeVaultOption) {
    const vaultButton = document.createElement('button');
    vaultButton.type = 'button';
    vaultButton.className = 'export-destination-option';
    vaultButton.dataset.destinationId = 'vault';
    const vaultLabel = document.createElement('span');
    vaultLabel.className = 'export-destination-option-label';
    vaultLabel.textContent = 'Vault';
    const vaultPath = document.createElement('span');
    vaultPath.className = 'export-destination-option-path';
    vaultPath.textContent = 'Vault/clip.md';
    vaultButton.append(vaultLabel, vaultPath);
    optionsContainer.appendChild(vaultButton);
  }
  details.appendChild(optionsContainer);
  row.appendChild(details);

  if (options?.includeLink !== false) {
    const link = document.createElement('a');
    link.className = 'export-destination-setup-link';
    link.textContent = options?.setupLabel ?? 'Configure vault';
    link.href = 'https://example.com/original';
    row.appendChild(link);
  }

  root.appendChild(row);
  return root;
}

describe('patchExportDestinationRow', () => {
  it('preserves an existing localized setup link label while updating the href', () => {
    const root = createRow({ setupLabel: 'Configurer le coffre' });
    const patched = patchExportDestinationRow(root, createDestination());
    const link = root.querySelector<HTMLAnchorElement>('.export-destination-setup-link');

    expect(patched).toBe(true);
    expect(link?.textContent).toBe('Configurer le coffre');
    expect(link?.href).toBe('https://example.com/setup');
  });

  it('creates a setup link through the existing runtime localization contract', () => {
    const root = createRow({ includeLink: false });
    const patched = patchExportDestinationRow(root, createDestination());
    const link = root.querySelector<HTMLAnchorElement>('.export-destination-setup-link');

    expect(patched).toBe(true);
    expect(link?.textContent).toBe('Configure vault');
    expect(link?.href).toBe('https://example.com/setup');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
  });

  it('removes the setup link when a configured vault is available', () => {
    const root = createRow({ setupLabel: 'Configure vault' });
    const patched = patchExportDestinationRow(
      root,
      createDestination({ hasConfiguredVault: true, setupUrl: undefined })
    );

    expect(patched).toBe(true);
    expect(root.querySelector('.export-destination-setup-link')).toBeNull();
  });

  it('restores keyboard-visible option focus to the retained summary when closing the menu', () => {
    const root = createRow({ includeVaultOption: true });
    document.body.appendChild(root);
    const row = root.querySelector<HTMLElement>('.export-destination-row');
    const details = root.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const summary = root.querySelector<HTMLElement>('.export-destination-summary');
    const option = root.querySelector<HTMLButtonElement>(
      '.export-destination-option[data-destination-id="vault"]'
    );
    if (!row || !details || !summary || !option) throw new Error('focus fixture missing');
    const focus = vi.spyOn(summary, 'focus');
    vi.spyOn(option, 'matches').mockImplementation((selector) => selector === ':focus-visible');
    details.open = true;
    option.focus();

    const destination = createDestination({
      id: 'vault',
      kind: 'vault',
      label: 'Vault',
      path: 'Vault/clip.md',
      hasConfiguredVault: true,
      setupUrl: undefined,
      options: [
        {
          id: 'downloads',
          kind: 'downloads',
          label: 'Downloads',
          path: 'Downloads/clip.md',
          selected: false
        },
        {
          id: 'vault',
          kind: 'vault',
          label: 'Vault',
          path: 'Vault/clip.md',
          selected: true
        }
      ]
    });
    const patched = patchExportDestinationRow(root, destination, true);

    expect(patched).toBe(true);
    expect(details.open).toBe(false);
    expect(root.querySelector('.export-destination-row')).toBe(row);
    expect(root.querySelector('.export-destination-option[data-destination-id="vault"]')).toBe(
      option
    );
    expect(option.classList.contains('is-selected')).toBe(true);
    expect(document.activeElement).toBe(summary);
    expect(focus).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    expect(patchExportDestinationRow(root, destination)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('preserves an open menu and retained option focus when selection is unchanged', () => {
    const root = createRow({ includeVaultOption: true });
    document.body.appendChild(root);
    const details = root.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const summary = root.querySelector<HTMLElement>('.export-destination-summary');
    const option = root.querySelector<HTMLButtonElement>(
      '.export-destination-option[data-destination-id="vault"]'
    );
    if (!details || !summary || !option) throw new Error('focus fixture missing');
    const focus = vi.spyOn(summary, 'focus');
    vi.spyOn(option, 'matches').mockReturnValue(false);
    details.open = true;
    option.focus();

    const destination = createDestination({
      options: [
        {
          id: 'downloads',
          kind: 'downloads',
          label: 'Downloads',
          path: 'Downloads/clip.md',
          selected: true
        },
        {
          id: 'vault',
          kind: 'vault',
          label: 'Vault',
          path: 'Vault/clip.md',
          selected: false
        }
      ]
    });
    expect(patchExportDestinationRow(root, destination)).toBe(true);
    expect(details.open).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(option);

    const external = document.createElement('button');
    document.body.appendChild(external);
    external.focus();
    details.open = true;
    expect(patchExportDestinationRow(root, destination)).toBe(true);
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(external);
    expect(focus).not.toHaveBeenCalled();
    external.remove();
  });

  it('preserves an open menu and retained option focus on a passive selection change', () => {
    const root = createRow({ includeVaultOption: true });
    document.body.appendChild(root);
    const row = root.querySelector<HTMLElement>('.export-destination-row');
    const details = root.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const summary = root.querySelector<HTMLElement>('.export-destination-summary');
    const vault = root.querySelector<HTMLButtonElement>('[data-destination-id="vault"]');
    if (!row || !details || !summary || !vault) throw new Error('passive fixture missing');
    const summaryFocus = vi.spyOn(summary, 'focus');
    vi.spyOn(vault, 'matches').mockImplementation((selector) => selector === ':focus-visible');
    details.open = true;
    vault.focus();

    expect(
      patchExportDestinationRow(
        root,
        createDestination({
          id: 'vault',
          kind: 'vault',
          label: 'Vault',
          path: 'Vault/clip.md',
          hasConfiguredVault: true,
          setupUrl: undefined,
          options: [
            {
              id: 'downloads',
              kind: 'downloads',
              label: 'Downloads',
              path: 'Downloads/clip.md',
              selected: false
            },
            {
              id: 'vault',
              kind: 'vault',
              label: 'Vault',
              path: 'Vault/clip.md',
              selected: true
            }
          ]
        })
      )
    ).toBe(true);
    expect(root.querySelector('.export-destination-row')).toBe(row);
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(vault);
    expect(summaryFocus).not.toHaveBeenCalled();
  });

  it('adds an option in place while preserving the open menu and retained option focus', () => {
    const root = createRow({ includeVaultOption: true });
    document.body.appendChild(root);
    const row = root.querySelector<HTMLElement>('.export-destination-row');
    const details = root.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const summary = root.querySelector<HTMLElement>('.export-destination-summary');
    const downloads = root.querySelector<HTMLButtonElement>('[data-destination-id="downloads"]');
    const vault = root.querySelector<HTMLButtonElement>('[data-destination-id="vault"]');
    if (!row || !details || !summary || !downloads || !vault) {
      throw new Error('add option fixture missing');
    }
    vi.spyOn(vault, 'matches').mockImplementation((selector) => selector === ':focus-visible');
    details.open = true;
    vault.focus();

    expect(
      patchExportDestinationRow(
        root,
        createDestination({
          options: [
            {
              id: 'downloads',
              kind: 'downloads',
              label: 'Downloads renamed',
              path: 'Downloads/renamed.md',
              selected: true
            },
            {
              id: 'vault',
              kind: 'vault',
              label: 'Vault renamed',
              path: 'Vault/renamed.md',
              selected: false
            },
            {
              id: 'archive',
              kind: 'vault',
              label: 'Archive',
              path: 'Archive/clip.md',
              selected: false
            }
          ]
        })
      )
    ).toBe(true);

    expect(root.querySelector('.export-destination-row')).toBe(row);
    expect(root.querySelector('.export-destination-menu')).toBe(details);
    expect(root.querySelector('.export-destination-summary')).toBe(summary);
    expect(root.querySelector('[data-destination-id="downloads"]')).toBe(downloads);
    expect(root.querySelector('[data-destination-id="vault"]')).toBe(vault);
    expect(
      Array.from(root.querySelectorAll<HTMLElement>('[data-destination-id]')).map(
        (button) => button.dataset.destinationId
      )
    ).toEqual(['downloads', 'vault', 'archive']);
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(vault);
    expect(vault.querySelector('.export-destination-option-label')?.textContent).toBe(
      'Vault renamed'
    );
  });

  it('removes an unfocused option while retaining the focused option and open menu', () => {
    const root = createRow({ includeVaultOption: true });
    document.body.appendChild(root);
    const details = root.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const downloads = root.querySelector<HTMLButtonElement>('[data-destination-id="downloads"]');
    if (!details || !downloads) throw new Error('unfocused removal fixture missing');
    vi.spyOn(downloads, 'matches').mockImplementation((selector) => selector === ':focus-visible');
    details.open = true;
    downloads.focus();

    expect(patchExportDestinationRow(root, createDestination())).toBe(true);
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(downloads);
    expect(root.querySelector('[data-destination-id="downloads"]')).toBe(downloads);
    expect(root.querySelector('[data-destination-id="vault"]')).toBeNull();
  });

  it('closes and focuses the retained summary when the focused option is removed', () => {
    const root = createRow({ includeVaultOption: true });
    document.body.appendChild(root);
    const details = root.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const summary = root.querySelector<HTMLElement>('.export-destination-summary');
    const vault = root.querySelector<HTMLButtonElement>('[data-destination-id="vault"]');
    if (!details || !summary || !vault) throw new Error('focused removal fixture missing');
    vi.spyOn(vault, 'matches').mockImplementation((selector) => selector === ':focus-visible');
    details.open = true;
    vault.focus();

    expect(patchExportDestinationRow(root, createDestination())).toBe(true);
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(root.querySelector('[data-destination-id="vault"]')).toBeNull();
  });

  it('repairs duplicate current destination IDs without replacing the row structure', () => {
    const root = createRow({ includeVaultOption: true });
    const row = root.querySelector<HTMLElement>('.export-destination-row');
    const details = root.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const summary = root.querySelector<HTMLElement>('.export-destination-summary');
    const buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.export-destination-option')
    );
    const duplicate = buttons[1];
    if (!row || !details || !summary || !duplicate) throw new Error('duplicate fixture missing');
    duplicate.dataset.destinationId = 'downloads';
    duplicate.classList.add('is-selected');

    expect(
      patchExportDestinationRow(
        root,
        createDestination({
          id: 'vault',
          kind: 'vault',
          label: 'Vault',
          path: 'Vault/clip.md',
          hasConfiguredVault: true,
          setupUrl: undefined,
          options: [
            {
              id: 'vault',
              kind: 'vault',
              label: 'Vault',
              path: 'Vault/clip.md',
              selected: true
            },
            {
              id: 'downloads',
              kind: 'downloads',
              label: 'Downloads',
              path: 'Downloads/clip.md',
              selected: false
            }
          ]
        })
      )
    ).toBe(true);
    expect(root.querySelector('.export-destination-row')).toBe(row);
    expect(root.querySelector('.export-destination-menu')).toBe(details);
    expect(root.querySelector('.export-destination-summary')).toBe(summary);
    expect(
      Array.from(root.querySelectorAll<HTMLElement>('[data-destination-id]')).map(
        (button) => button.dataset.destinationId
      )
    ).toEqual(['vault', 'downloads']);
  });

  it('moves retained template options and updates their attributes without losing interaction state', () => {
    const current = createRow({ includeVaultOption: true });
    const next = createRow({ includeVaultOption: true, setupLabel: 'Configure next vault' });
    document.body.appendChild(current);
    const row = current.querySelector<HTMLElement>('.export-destination-row');
    const details = current.querySelector<HTMLDetailsElement>('.export-destination-menu');
    const summary = current.querySelector<HTMLElement>('.export-destination-summary');
    const vault = current.querySelector<HTMLButtonElement>('[data-destination-id="vault"]');
    const nextContainer = next.querySelector<HTMLElement>('.export-destination-options');
    const nextVault = next.querySelector<HTMLButtonElement>('[data-destination-id="vault"]');
    if (!row || !details || !summary || !vault || !nextContainer || !nextVault) {
      throw new Error('template move fixture missing');
    }
    const nextVaultLabel = nextVault.querySelector<HTMLElement>('.export-destination-option-label');
    const nextVaultPath = nextVault.querySelector<HTMLElement>('.export-destination-option-path');
    if (!nextVaultLabel || !nextVaultPath) throw new Error('template move copy missing');
    nextVault.classList.add('is-selected');
    nextVaultLabel.textContent = 'Moved Vault';
    nextVaultPath.textContent = 'Moved/Vault.md';
    nextContainer.prepend(nextVault);
    details.open = true;
    vault.focus();

    reconcileExportDestinationRow(current, next);

    expect(current.querySelector('.export-destination-row')).toBe(row);
    expect(current.querySelector('.export-destination-menu')).toBe(details);
    expect(current.querySelector('.export-destination-summary')).toBe(summary);
    expect(current.querySelector('[data-destination-id="vault"]')).toBe(vault);
    expect(
      Array.from(current.querySelectorAll<HTMLElement>('[data-destination-id]')).map(
        (button) => button.dataset.destinationId
      )
    ).toEqual(['vault', 'downloads']);
    expect(vault.classList).toContain('is-selected');
    expect(vault.querySelector('.export-destination-option-label')?.textContent).toBe(
      'Moved Vault'
    );
    expect(vault.querySelector('.export-destination-option-path')?.textContent).toBe(
      'Moved/Vault.md'
    );
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(vault);
  });

  it('adds, replaces and removes a destination row from a detached session template', () => {
    const current = document.createElement('div');
    current.innerHTML = '<div class="surface-window-footer"></div>';
    const next = createRow({ setupLabel: 'Configure next vault' });

    reconcileExportDestinationRow(current, next);
    expect(current.querySelector('.export-destination-setup-link')?.textContent).toBe(
      'Configure next vault'
    );

    const replacement = createRow({ setupLabel: 'Replacement label' });
    reconcileExportDestinationRow(current, replacement);
    expect(current.querySelectorAll('.export-destination-row')).toHaveLength(1);
    expect(current.querySelector('.export-destination-setup-link')?.textContent).toBe(
      'Replacement label'
    );

    reconcileExportDestinationRow(current, document.createElement('div'));
    expect(current.querySelector('.export-destination-row')).toBeNull();
  });
});
