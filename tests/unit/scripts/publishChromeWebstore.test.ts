import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  createChromeWebStoreUrls,
  dryRunChromeWebStoreRelease,
  publishChromeWebStorePackage,
  readChromeWebStoreConfig,
  resolveReleaseOptionsFromArgs
} from '../../../scripts/publish-chrome-webstore.mjs';

const completeEnv = {
  CWS_CLIENT_ID: 'client-id',
  CWS_CLIENT_SECRET: 'client-secret',
  CWS_REFRESH_TOKEN: 'refresh-token',
  CWS_EXTENSION_ID: 'extension-id',
  CWS_PUBLISHER_ID: 'publisher-id'
};

describe('Chrome Web Store publisher script', () => {
  it('requires all Chrome Web Store credentials including publisher id', () => {
    expect(() =>
      readChromeWebStoreConfig({
        ...completeEnv,
        CWS_PUBLISHER_ID: ''
      })
    ).toThrow('Missing required environment variables: CWS_PUBLISHER_ID');

    expect(readChromeWebStoreConfig(completeEnv)).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      itemId: 'extension-id',
      publisherId: 'publisher-id'
    });
  });

  it('constructs publisher-scoped upload and publish URLs', () => {
    expect(
      createChromeWebStoreUrls({
        publisherId: 'publisher id',
        itemId: 'item/id'
      })
    ).toEqual({
      upload:
        'https://chromewebstore.googleapis.com/upload/v2/publishers/publisher%20id/items/item%2Fid:upload',
      publish:
        'https://chromewebstore.googleapis.com/v2/publishers/publisher%20id/items/item%2Fid:publish'
    });
  });

  it('defaults the CLI to dry-run and requires an explicit zip path', async () => {
    await expect(resolveReleaseOptionsFromArgs([], '/repo')).rejects.toThrow(
      'Dry-run requires --zip <path>. Refusing to auto-select release artifacts.'
    );

    await expect(resolveReleaseOptionsFromArgs(['--publish'], '/repo')).rejects.toThrow(
      'Publish mode requires --zip <path>. Refusing to auto-select release artifacts.'
    );

    await expect(resolveReleaseOptionsFromArgs(['--zip', 'release.zip'], '/repo')).resolves.toEqual(
      {
        mode: 'dry-run',
        zipPath: '/repo/release.zip'
      }
    );

    await expect(
      resolveReleaseOptionsFromArgs(['--publish', '--zip', 'release.zip'], '/repo')
    ).resolves.toEqual({
      mode: 'publish',
      zipPath: '/repo/release.zip'
    });
  });

  it('dry-runs with credentials and an explicit existing zip without network requests', async () => {
    const accessImpl = vi.fn().mockResolvedValue(undefined);
    const logger = { log: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);

    await expect(
      dryRunChromeWebStoreRelease({
        zipPath: '/repo/release.zip',
        env: completeEnv,
        accessImpl,
        logger
      })
    ).resolves.toEqual({
      mode: 'dry-run',
      itemId: 'extension-id',
      publisherId: 'publisher-id',
      zipPath: '/repo/release.zip',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      uploadUrl:
        'https://chromewebstore.googleapis.com/upload/v2/publishers/publisher-id/items/extension-id:upload',
      publishUrl:
        'https://chromewebstore.googleapis.com/v2/publishers/publisher-id/items/extension-id:publish'
    });

    expect(accessImpl).toHaveBeenCalledWith('/repo/release.zip');
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('fails dry-run before network work when credentials are incomplete', async () => {
    const accessImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      dryRunChromeWebStoreRelease({
        zipPath: '/repo/release.zip',
        env: {
          ...completeEnv,
          CWS_REFRESH_TOKEN: ''
        },
        accessImpl,
        logger: { log: vi.fn(), error: vi.fn() }
      })
    ).rejects.toThrow('Missing required environment variables: CWS_REFRESH_TOKEN');

    expect(accessImpl).not.toHaveBeenCalled();
  });

  it('exchanges the refresh token, uploads the zip, and publishes the existing item', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'access-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ uploadState: 'SUCCESS' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ itemId: 'extension-id' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    const readFileImpl = vi.fn().mockResolvedValue(Buffer.from('zip-bytes'));

    await expect(
      publishChromeWebStorePackage({
        zipPath: 'all-in-ob-v0.2.1.zip',
        env: completeEnv,
        fetchImpl,
        readFileImpl,
        logger: { log: vi.fn(), error: vi.fn() }
      })
    ).resolves.toEqual({
      upload: { uploadState: 'SUCCESS' },
      publish: { itemId: 'extension-id' }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://oauth2.googleapis.com/token');
    expect(fetchImpl.mock.calls[0]?.[1]?.body.toString()).toContain('grant_type=refresh_token');
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'https://chromewebstore.googleapis.com/upload/v2/publishers/publisher-id/items/extension-id:upload'
    );
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/zip'
      },
      body: Buffer.from('zip-bytes')
    });
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      'https://chromewebstore.googleapis.com/v2/publishers/publisher-id/items/extension-id:publish'
    );
    expect(fetchImpl.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token'
      }
    });
    expect(fetchImpl.mock.calls[2]?.[1]?.body).toBeUndefined();
  });
});
