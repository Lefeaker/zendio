import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  publishChromeWebStorePackage,
  readChromeWebStoreConfig
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
