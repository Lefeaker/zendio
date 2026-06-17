/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
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

function createRow(options?: { setupLabel?: string; includeLink?: boolean }): HTMLElement {
  const root = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'export-destination-row';

  const details = document.createElement('details');
  details.className = 'export-destination-menu';

  const summary = document.createElement('summary');
  summary.className = 'export-destination-summary';

  const copy = document.createElement('div');
  copy.className = 'export-destination-copy';

  const label = document.createElement('strong');
  label.className = 'export-destination-label';
  label.textContent = 'Downloads';

  const path = document.createElement('span');
  path.className = 'export-destination-path';
  path.textContent = 'Downloads/clip.md';

  copy.append(label, path);
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

  it('returns false instead of synthesizing a new setup link label', () => {
    const root = createRow({ includeLink: false });
    const patched = patchExportDestinationRow(root, createDestination());

    expect(patched).toBe(false);
    expect(root.querySelector('.export-destination-setup-link')).toBeNull();
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
});
