/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  buildRestConnectionResult,
  renderRestConnectionTestResult,
  resetRestConnectionTestResult
} from '@options/app/rest-settings/restSectionConnectionResult';

describe('restSectionConnectionResult', () => {
  it('builds the result card, renders severities, and resets the host', () => {
    const host = document.createElement('div');
    host.hidden = true;

    const card = buildRestConnectionResult(
      document.createElement.bind(document),
      { testConnectionButton: 'Connection status' },
      host
    );

    expect(card.textContent).toContain('Connection status');
    expect(card.contains(host)).toBe(true);

    renderRestConnectionTestResult({
      connectionResultHost: host,
      type: 'success',
      text: 'Connected\nVault is reachable'
    });

    const successAlert = host.querySelector('.alert');
    expect(host.hidden).toBe(false);
    expect(successAlert?.classList.contains('alert-success')).toBe(true);
    expect(host.textContent).toContain('Connected');
    expect(host.textContent).toContain('Vault is reachable');

    renderRestConnectionTestResult({
      connectionResultHost: host,
      type: 'error',
      text: 'Failed'
    });
    expect(host.querySelector('.alert')?.classList.contains('alert-error')).toBe(true);
    expect(host.querySelector('button')).toBeTruthy();

    resetRestConnectionTestResult(host);
    expect(host.hidden).toBe(true);
    expect(host.childElementCount).toBe(0);
  });

  it('tolerates missing result hosts', () => {
    expect(() =>
      renderRestConnectionTestResult({
        connectionResultHost: null,
        type: 'info',
        text: 'Skipped'
      })
    ).not.toThrow();
    expect(() => resetRestConnectionTestResult(null)).not.toThrow();
  });
});
