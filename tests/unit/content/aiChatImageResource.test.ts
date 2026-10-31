import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAIChatImageLoader } from '../../../src/content/extractors/aiChatImageResource';
import { isKimiSignedImageUrl } from '../../../src/shared/attachments/aiChatImagePolicy';
import type { PlatformId } from '../../../src/third_party/ai-chat-exporter/types';
import {
  AI_CHAT_IMAGE_MAX_BASE64_LENGTH,
  AI_CHAT_IMAGE_MAX_BYTES,
  createAIChatImageAttachment
} from '../../../src/shared/attachments/aiChatImageBytes';
import { imageBytes, imageSample } from '../shared/aiChatImageTestSamples';

const page = 'https://grok.com/c/synthetic';
const kimiPage = 'https://www.kimi.com/chat/synthetic';
const kimiImage =
  'https://www.kimi.com/apiv2-files/sign-obj/kimi-fs%2Ffiles%2Fblob%2Fsynthetic?filename=test.jpg&sig=synthetic-signature%3D&t=t';
const sample = imageSample('png');
const pngResponse = () =>
  new Response(imageBytes(sample.base64), { headers: { 'content-type': 'image/png' } });
afterEach(() => vi.useRealTimers());

describe('AI image content acquisition', () => {
  it('recognizes only the observed bounded Kimi signed image route', () => {
    expect(isKimiSignedImageUrl(new URL(kimiImage), new URL(kimiPage), 'kimi')).toBe(true);
    expect(isKimiSignedImageUrl(new URL(kimiImage), new URL(kimiPage), 'grok')).toBe(false);
    expect(
      isKimiSignedImageUrl(new URL(kimiImage), new URL('https://kimi.com/chat/synthetic'), 'kimi')
    ).toBe(false);
  });

  it.each([
    kimiImage.replace('www.kimi.com/', 'www.kimi.com.evil.example/'),
    kimiImage.replace('https:', 'http:'),
    kimiImage.replace('https://', 'https://user:password@'),
    kimiImage.replace('/sign-obj/', '/other/'),
    kimiImage.replace('synthetic?', 'synthetic/extra?'),
    kimiImage.replace('t=t', 't=p'),
    kimiImage.replace('sig=synthetic-signature%3D', 'sig='),
    kimiImage.replace('filename=test.jpg', 'filename='),
    `${kimiImage}&sig=duplicate`,
    `${kimiImage}&%73ig=duplicate`,
    `${kimiImage}&redirect=https://other.example/image.jpg`,
    `${kimiImage}#fragment`,
    kimiImage.replace('filename=test.jpg', `filename=${'x'.repeat(256)}`),
    kimiImage.replace('sig=synthetic-signature%3D', `sig=${'x'.repeat(1025)}`),
    kimiImage.replace('synthetic?', `${'x'.repeat(2049)}?`)
  ])('does not grant the Kimi signed-route exception to invalid input %#', (url) => {
    expect(isKimiSignedImageUrl(new URL(url), new URL(kimiPage), 'kimi')).toBe(false);
  });

  it.each(['opaque redirect', 'network TypeError'])(
    'delegates the exact Kimi route after %s while retaining the initial manual request',
    async (failure) => {
      const attachment = await createAIChatImageAttachment(
        imageBytes(sample.base64),
        sample.mimeType,
        new AbortController().signal
      );
      const sendBackground = vi.fn(() => Promise.resolve(attachment));
      const response = new Response(null);
      vi.spyOn(response, 'type', 'get').mockReturnValue('opaqueredirect');
      const fetch = vi.fn<typeof globalThis.fetch>(() =>
        failure === 'opaque redirect'
          ? Promise.resolve(response)
          : Promise.reject(new TypeError('Failed'))
      );
      const result = await createAIChatImageLoader({ fetch, sendBackground })(
        kimiImage,
        kimiPage,
        'kimi',
        new AbortController().signal
      );
      expect(result).toEqual(attachment);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        kimiImage,
        expect.objectContaining({ credentials: 'same-origin', redirect: 'manual' })
      );
      expect(sendBackground).toHaveBeenCalledExactlyOnceWith({
        url: kimiImage,
        sourceUrl: kimiPage,
        platform: 'kimi'
      });
    }
  );

  it.each([kimiImage.replace('t=t', 't=p'), 'https://www.kimi.com/other.jpg'])(
    'does not delegate another same-origin TypeError for %#',
    async (url) => {
      const sendBackground = vi.fn();
      const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new TypeError('Failed')));
      await expect(
        createAIChatImageLoader({ fetch, sendBackground })(
          url,
          kimiPage,
          'kimi',
          new AbortController().signal
        )
      ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_NETWORK' });
      expect(sendBackground).not.toHaveBeenCalled();
    }
  );

  it('does not delegate a Kimi HTTP 403 or an aborted opaque redirect', async () => {
    const sendBackground = vi.fn();
    await expect(
      createAIChatImageLoader({
        fetch: () => Promise.resolve(new Response(null, { status: 403 })),
        sendBackground
      })(kimiImage, kimiPage, 'kimi', new AbortController().signal)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_HTTP', status: 403 });
    const controller = new AbortController();
    const response = new Response(null);
    vi.spyOn(response, 'type', 'get').mockReturnValue('opaqueredirect');
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      controller.abort();
      return Promise.resolve(response);
    });
    await expect(
      createAIChatImageLoader({ fetch, sendBackground })(
        kimiImage,
        kimiPage,
        'kimi',
        controller.signal
      )
    ).rejects.toBeDefined();
    expect(sendBackground).not.toHaveBeenCalled();
  });

  it.each([
    ['https://grok.com/image.png', 'same-origin', 'default'],
    ['https://assets.grok.com/image.png', 'include', 'no-store'],
    ['blob:https://grok.com/synthetic', 'same-origin', 'default']
  ])('loads %s with %s credentials and %s cache', async (url, credentials, cache) => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(pngResponse()));
    const result = await createAIChatImageLoader({ fetch })(
      url,
      page,
      'grok',
      new AbortController().signal
    );
    expect(result.content.data).toBe(sample.base64);
    expect(fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ credentials, cache, redirect: 'manual' })
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  const anonymousSources: Array<{ page: string; platform: PlatformId; url: string }> = [
    { page, platform: 'grok', url: 'https://assets.grok.com.evil.example/image.png' },
    { page, platform: 'grok', url: 'https://other.assets.grok.com/image.png' },
    { page, platform: 'grok', url: 'http://assets.grok.com/image.png' },
    { page, platform: 'grok', url: 'https://assets.grok.com:8443/image.png' },
    {
      page: 'https://chatgpt.com/c/synthetic',
      platform: 'chatgpt',
      url: 'https://assets.grok.com/image.png'
    },
    {
      page: 'https://www.grok.com/c/synthetic',
      platform: 'grok',
      url: 'https://assets.grok.com/image.png'
    },
    {
      page: 'http://grok.com/c/synthetic',
      platform: 'grok',
      url: 'https://assets.grok.com/image.png'
    },
    {
      page: 'https://grok.com:8443/c/synthetic',
      platform: 'grok',
      url: 'https://assets.grok.com/image.png'
    }
  ];
  it.each(anonymousSources)(
    'does not inherit authenticated Grok CDN policy for boundary %#',
    async (source) => {
      const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(pngResponse()));
      await createAIChatImageLoader({ fetch })(
        source.url,
        source.page,
        source.platform,
        new AbortController().signal
      );
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        source.url,
        expect.objectContaining({ credentials: 'omit', cache: 'default', redirect: 'manual' })
      );
    }
  );

  it.each(['https://grok.com.evil.example/c/synthetic', 'https://chatgpt.com/c/synthetic'])(
    'rejects a false Grok source %s before fetch',
    async (sourcePageUrl) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      await expect(
        createAIChatImageLoader({ fetch })(
          'https://assets.grok.com/image.png',
          sourcePageUrl,
          'grok',
          new AbortController().signal
        )
      ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SOURCE' });
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('reads a real data URL without re-encoding the image', async () => {
    const result = await createAIChatImageLoader()(
      `data:image/png;base64,${sample.base64}`,
      page,
      'grok',
      new AbortController().signal
    );
    expect(result.content.data).toBe(sample.base64);
  });

  it('keeps the native fetch global receiver', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(pngResponse());
    });
    await createAIChatImageLoader({ fetch })(
      'https://grok.com/image.png',
      page,
      'grok',
      new AbortController().signal
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reads percent-encoded SVG as original UTF-8 bytes', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>图</text></svg>';
    const result = await createAIChatImageLoader()(
      `data:image/svg+xml,${encodeURIComponent(svg)}`,
      page,
      'grok',
      new AbortController().signal
    );
    expect(Buffer.from(result.content.data, 'base64').toString()).toBe(svg);
  });

  it('only falls back after a permitted cross-origin fetch TypeError', async () => {
    const attachment = await createAIChatImageAttachment(
      imageBytes(sample.base64),
      sample.mimeType,
      new AbortController().signal
    );
    const sendBackground = vi.fn(() => Promise.resolve(attachment));
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    );
    const result = await createAIChatImageLoader({ fetch, sendBackground })(
      'https://assets.grok.com/image.png',
      page,
      'grok',
      new AbortController().signal
    );
    expect(result).toEqual(attachment);
    expect(sendBackground).toHaveBeenCalledExactlyOnceWith({
      url: 'https://assets.grok.com/image.png',
      sourceUrl: page,
      platform: 'grok'
    });
  });

  it.each([403, 302])('does not retry HTTP %i in another context', async (status) => {
    const sendBackground = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(null, { status }))
    );
    await expect(
      createAIChatImageLoader({ fetch, sendBackground })(
        'https://assets.grok.com/image.png',
        page,
        'grok',
        new AbortController().signal
      )
    ).rejects.toBeDefined();
    expect(sendBackground).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://assets.grok.com/image.png',
      expect.objectContaining({ credentials: 'include', cache: 'no-store', redirect: 'manual' })
    );
  });

  it('does not retry a MIME failure or a non-whitelisted network failure', async () => {
    const sendBackground = vi.fn();
    const badMime = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })
      )
    );
    await expect(
      createAIChatImageLoader({ fetch: badMime, sendBackground })(
        'https://assets.grok.com/image.png',
        page,
        'grok',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_MIME' });
    const refused = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new TypeError('Failed')));
    await expect(
      createAIChatImageLoader({ fetch: refused, sendBackground })(
        'https://other.example/image.png',
        page,
        'grok',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_NETWORK' });
    expect(sendBackground).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.1/image.png',
    'http://0x7f000001/image.png',
    'http://[::1]/x',
    'http://localhost/x',
    'https://user:pass@grok.com/x',
    'file:///tmp/x',
    'blob:https://other.example/id',
    'data:image/png;base64,%bad',
    'data:image/svg+xml,%GG'
  ])('rejects invalid or unsafe source %s before fetch', async (url) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      createAIChatImageLoader({ fetch })(url, page, 'grok', new AbortController().signal)
    ).rejects.toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds data URL parsing before starting fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      createAIChatImageLoader({ fetch })(
        `data:image/png;base64,${'A'.repeat(AI_CHAT_IMAGE_MAX_BASE64_LENGTH + 1)}`,
        page,
        'grok',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SIZE' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized encoded source before URL parsing can normalize it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const oversized = `data:image/svg+xml,${' '.repeat(AI_CHAT_IMAGE_MAX_BYTES * 3 + 258)}`;
    await expect(
      createAIChatImageLoader({ fetch })(oversized, page, 'grok', new AbortController().signal)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SIZE' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enforces its own 30-second deadline and aborts the underlying fetch', async () => {
    vi.useFakeTimers();
    let active: AbortSignal | null | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => {
      active = init?.signal;
      return new Promise(() => undefined);
    });
    const pending = createAIChatImageLoader({ fetch })(
      'https://assets.grok.com/image.png',
      page,
      'grok',
      new AbortController().signal
    );
    const rejection = expect(pending).rejects.toMatchObject({ timedOut: true });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(active?.aborted).toBe(true);
  });

  it('honors caller cancellation without a background fallback', async () => {
    const controller = new AbortController();
    const sendBackground = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      controller.abort();
      return Promise.reject(new TypeError('Aborted fetch'));
    });
    await expect(
      createAIChatImageLoader({ fetch, sendBackground })(
        'https://assets.grok.com/image.png',
        page,
        'grok',
        controller.signal
      )
    ).rejects.toMatchObject({ timedOut: false });
    expect(sendBackground).not.toHaveBeenCalled();
  });

  it('cancels an unread response body at its resource deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(new ReadableStream({ cancel })))
    );
    const rejection = expect(
      createAIChatImageLoader({ fetch })(
        'https://grok.com/image.png',
        page,
        'grok',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ timedOut: true });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('discards a background result arriving after caller cancellation', async () => {
    const attachment = await createAIChatImageAttachment(
      imageBytes(sample.base64),
      sample.mimeType,
      new AbortController().signal
    );
    let finish: (result: typeof attachment) => void = () => undefined;
    const reply = new Promise<typeof attachment>((resolve) => {
      finish = resolve;
    });
    const sendBackground = vi.fn(() => reply);
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new TypeError('Failed')));
    const controller = new AbortController();
    const pending = createAIChatImageLoader({ fetch, sendBackground })(
      'https://assets.grok.com/image.png',
      page,
      'grok',
      controller.signal
    );
    const rejection = expect(pending).rejects.toMatchObject({ timedOut: false });
    await vi.waitFor(() => expect(sendBackground).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    finish(attachment);
  });
});
