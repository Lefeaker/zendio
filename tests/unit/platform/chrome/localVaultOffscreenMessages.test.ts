import { describe, expect, it } from 'vitest';
import { isTrustedLocalVaultOffscreenSender } from '../../../../src/platform/chrome/localVaultOffscreenMessages';

const runtimeId = 'extension-id';
const extensionOrigin = `chrome-extension://${runtimeId}`;

describe('isTrustedLocalVaultOffscreenSender', () => {
  it('accepts a same-extension service worker sender with matching id and no tab', () => {
    expect(isTrustedLocalVaultOffscreenSender({ id: runtimeId }, runtimeId, extensionOrigin)).toBe(
      true
    );
  });

  it('accepts a same-extension sender with extension url and origin evidence', () => {
    expect(
      isTrustedLocalVaultOffscreenSender(
        {
          id: runtimeId,
          origin: extensionOrigin,
          url: `${extensionOrigin}/offscreen/local-vault.html`
        },
        runtimeId,
        extensionOrigin
      )
    ).toBe(true);
  });

  it('accepts extension-origin evidence when runtime id is unavailable', () => {
    expect(
      isTrustedLocalVaultOffscreenSender(
        {
          origin: extensionOrigin,
          url: `${extensionOrigin}/offscreen/local-vault.html`
        },
        undefined,
        extensionOrigin
      )
    ).toBe(true);
  });

  it('rejects a sender with a different extension id', () => {
    expect(
      isTrustedLocalVaultOffscreenSender(
        { id: 'other-extension', origin: extensionOrigin },
        runtimeId,
        extensionOrigin
      )
    ).toBe(false);
  });

  it('rejects a content-script sender with a tab even when id matches', () => {
    expect(
      isTrustedLocalVaultOffscreenSender(
        { id: runtimeId, tab: { id: 1 }, origin: extensionOrigin },
        runtimeId,
        extensionOrigin
      )
    ).toBe(false);
  });

  it('rejects external url or origin evidence', () => {
    expect(
      isTrustedLocalVaultOffscreenSender(
        {
          id: runtimeId,
          origin: 'https://example.com',
          url: `${extensionOrigin}/offscreen/local-vault.html`
        },
        runtimeId,
        extensionOrigin
      )
    ).toBe(false);
    expect(
      isTrustedLocalVaultOffscreenSender(
        {
          id: runtimeId,
          origin: extensionOrigin,
          url: 'https://example.com/page'
        },
        runtimeId,
        extensionOrigin
      )
    ).toBe(false);
  });

  it('rejects missing runtime id without extension-origin evidence', () => {
    expect(isTrustedLocalVaultOffscreenSender({ id: runtimeId }, undefined, undefined)).toBe(false);
  });
});
