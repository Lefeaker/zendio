import { describe, expect, it } from 'vitest';
import {
  canonicalizeExpectedReleaseSha,
  resolveReleaseContext
} from '../../../scripts/utils/releaseContext.mjs';

const sha = 'a'.repeat(40);

describe('release context', () => {
  it('peels the exact version tag to the current main SHA', () => {
    expect(
      resolveReleaseContext({
        eventName: 'push',
        ref: 'refs/tags/v0.2.1',
        eventSha: sha,
        headSha: sha,
        mainSha: sha,
        packageVersion: '0.2.1',
        browser: 'firefox'
      })
    ).toEqual({
      schema: 'zendio-release-context-v1',
      browser: 'firefox',
      event: 'push-tag',
      releaseSha: sha,
      mainSha: sha,
      packageVersion: '0.2.1',
      tag: 'v0.2.1',
      channel: 'listed'
    });
  });

  it('canonicalizes manual SHA once and keeps channel Firefox-only', () => {
    expect(canonicalizeExpectedReleaseSha(sha.toUpperCase())).toBe(sha);
    expect(
      resolveReleaseContext({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        eventSha: sha,
        headSha: sha,
        mainSha: sha,
        expectedSha: sha.toUpperCase(),
        packageVersion: '0.2.1',
        browser: 'firefox',
        channel: 'unlisted'
      }).channel
    ).toBe('unlisted');
    expect(() =>
      resolveReleaseContext({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        eventSha: sha,
        headSha: sha,
        mainSha: sha,
        expectedSha: sha,
        packageVersion: '0.2.1',
        browser: 'chrome',
        channel: 'listed'
      })
    ).toThrow('RELEASE_CONTEXT_CHANNEL_FORBIDDEN');
  });

  it.each([
    { name: 'old main', mainSha: 'b'.repeat(40) },
    { name: 'wrong event SHA', eventSha: 'b'.repeat(40) },
    { name: 'wrong checkout', headSha: 'b'.repeat(40) }
  ])('rejects $name', (mutation) => {
    expect(() =>
      resolveReleaseContext({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        eventSha: sha,
        headSha: sha,
        mainSha: sha,
        expectedSha: sha,
        packageVersion: '0.2.1',
        browser: 'chrome',
        ...mutation
      })
    ).toThrow('RELEASE_CONTEXT_SHA_MISMATCH');
  });

  it.each(['', 'a'.repeat(39), 'a'.repeat(41), ` ${sha}`, `${sha}\n`, 'g'.repeat(40)])(
    'rejects noncanonical manual SHA %j',
    (value) => {
      expect(() => canonicalizeExpectedReleaseSha(value)).toThrow(
        'RELEASE_CONTEXT_EXPECTED_SHA_INVALID'
      );
    }
  );
});
