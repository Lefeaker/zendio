import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAIChatImage,
  type AIChatImageFetchDependencies
} from '../../../src/background/application/aiChatImageFetch';
import type { MessageSenderInfo } from '../../../src/platform/interfaces/messaging';
import { imageBytes, imageSample } from '../shared/aiChatImageTestSamples';
import { AI_CHAT_IMAGE_MAX_BYTES } from '../../../src/shared/attachments/aiChatImageBytes';

const sourceUrl = 'https://grok.com/c/synthetic';
const input = { url: 'https://assets.grok.com/image.gif', sourceUrl, platform: 'grok' };
const sender: MessageSenderInfo = {
  id: 'our-extension',
  tabId: 1,
  frameId: 0,
  documentId: 'document-a',
  url: sourceUrl,
  origin: 'https://grok.com'
};
const active = { tabId: 1, frameId: 0, documentId: 'document-a', url: sourceUrl };
const gif = imageSample('gif');
function dependencies(): AIChatImageFetchDependencies {
  return {
    extensionId: 'our-extension',
    resolveSourceDocument: () => Promise.resolve(active),
    fetch: vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(imageBytes(gif.base64), { headers: { 'content-type': gif.mimeType } })
      )
    )
  };
}
afterEach(() => vi.useRealTimers());

describe('restricted background AI image fetch', () => {
  it('fetches an allowed actual source and verifies its live document twice', async () => {
    const deps = dependencies();
    const resolveSourceDocument = vi.fn(() => Promise.resolve(active));
    deps.resolveSourceDocument = resolveSourceDocument;
    const result = await fetchAIChatImage(input, sender, deps);
    expect(result.content.data).toBe(gif.base64);
    expect(deps.fetch).toHaveBeenCalledWith(
      input.url,
      expect.objectContaining({ credentials: 'omit', redirect: 'manual' })
    );
    expect(resolveSourceDocument).toHaveBeenCalledTimes(2);
  });

  const invalidSenders: MessageSenderInfo[] = [
    { ...sender, id: 'other-extension' },
    { ...sender, tabId: -1 },
    { id: sender.id, tabId: 1, frameId: 0, url: sourceUrl },
    { ...sender, url: 'https://grok.com/c/other' },
    { ...sender, origin: 'https://other.example' }
  ];
  it.each(invalidSenders)(
    'refuses untrusted or incomplete sender %# before fetching',
    async (candidate) => {
      const deps = dependencies();
      await expect(fetchAIChatImage(input, candidate, deps)).rejects.toBeDefined();
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    { ...active, documentId: 'replacement' },
    { ...active, frameId: 1 },
    { ...active, tabId: 2 },
    { ...active, url: 'https://grok.com/c/other' }
  ])('rejects a source identity mismatch %#', async (current) => {
    const deps = dependencies();
    deps.resolveSourceDocument = () => Promise.resolve(current);
    await expect(fetchAIChatImage(input, sender, deps)).rejects.toMatchObject({
      code: 'AI_CHAT_IMAGE_SOURCE'
    });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('rejects navigation while the response is being acquired', async () => {
    const deps = dependencies();
    deps.resolveSourceDocument = vi
      .fn()
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce({ ...active, documentId: 'replacement' });
    await expect(fetchAIChatImage(input, sender, deps)).rejects.toMatchObject({
      code: 'AI_CHAT_IMAGE_SOURCE'
    });
  });

  it.each([
    'http://localhost/image.gif',
    'https://127.0.0.1/x',
    'https://assets.grok.com.evil.example/x',
    'https://other.example/x',
    'data:image/gif;base64,AAAA',
    'https://user:password@assets.grok.com/x'
  ])('refuses disallowed URL %s', async (url) => {
    const deps = dependencies();
    await expect(fetchAIChatImage({ ...input, url }, sender, deps)).rejects.toBeDefined();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('does not accept a caller-provided method or headers', async () => {
    const deps = dependencies();
    await expect(
      fetchAIChatImage({ ...input, ...{ headers: { Authorization: 'not-used' } } }, sender, deps)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SENDER' });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('enforces its deadline independently of the content caller', async () => {
    vi.useFakeTimers();
    const deps = dependencies();
    let signal: AbortSignal | null | undefined;
    deps.fetch = (_url, init) => {
      signal = init?.signal;
      return new Promise(() => undefined);
    };
    const rejection = expect(fetchAIChatImage(input, sender, deps)).rejects.toMatchObject({
      timedOut: true
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(signal?.aborted).toBe(true);
  });
});

const kimiSource = 'https://www.kimi.com/chat/synthetic';
const kimiInput = {
  url: 'https://www.kimi.com/apiv2-files/sign-obj/kimi-fs%2Ffiles%2Fblob%2Fsynthetic?filename=test.jpg&sig=synthetic-signature%3D&t=t',
  sourceUrl: kimiSource,
  platform: 'kimi'
};
const kimiSender: MessageSenderInfo = {
  ...sender,
  url: kimiSource,
  origin: 'https://www.kimi.com'
};
const kimiActive = { ...active, url: kimiSource };
const kimiFinal = 'https://prod-chat-kimi.tos-cn-beijing.volces.com/image.jpg';
function kimiResponse(finalUrl = kimiFinal, body: BodyInit = imageBytes(gif.base64)): Response {
  const response = new Response(body, { headers: { 'content-type': gif.mimeType } });
  vi.spyOn(response, 'url', 'get').mockReturnValue(finalUrl);
  vi.spyOn(response, 'redirected', 'get').mockReturnValue(true);
  return response;
}
function kimiDependencies(response = kimiResponse()): AIChatImageFetchDependencies {
  return {
    extensionId: 'our-extension',
    resolveSourceDocument: () => Promise.resolve(kimiActive),
    fetch: vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response))
  };
}

describe('observed Kimi signed image redirect exception', () => {
  it('follows anonymously only for the exact signed route and validates source again after bytes', async () => {
    const deps = kimiDependencies();
    const resolveSourceDocument = vi.fn(() => Promise.resolve(kimiActive));
    deps.resolveSourceDocument = resolveSourceDocument;
    const result = await fetchAIChatImage(kimiInput, kimiSender, deps);
    expect(result.content.data).toBe(gif.base64);
    expect(deps.fetch).toHaveBeenCalledExactlyOnceWith(
      kimiInput.url,
      expect.objectContaining({ credentials: 'omit', redirect: 'follow', cache: 'no-store' })
    );
    expect(resolveSourceDocument).toHaveBeenCalledTimes(2);
  });

  it.each([
    'https://evil.example/image.jpg',
    'https://prod-chat-kimi.tos-cn-beijing.volces.com.evil.example/image.jpg',
    'https://sub.prod-chat-kimi.tos-cn-beijing.volces.com/image.jpg',
    'http://prod-chat-kimi.tos-cn-beijing.volces.com/image.jpg',
    'https://user:password@prod-chat-kimi.tos-cn-beijing.volces.com/image.jpg',
    'https://127.0.0.1/image.jpg',
    'https://prod-chat-kimi.tos-cn-beijing.volces.com:8443/image.jpg',
    '',
    kimiInput.url
  ])('cancels an unapproved final response before reading for boundary %#', async (url) => {
    const cancel = vi.fn();
    const deps = kimiDependencies(kimiResponse(url, new ReadableStream({ cancel })));
    await expect(fetchAIChatImage(kimiInput, kimiSender, deps)).rejects.toMatchObject({
      code: 'AI_CHAT_IMAGE_REDIRECT'
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    kimiInput.url.replace('t=t', 't=p'),
    kimiInput.url + '&extra=1',
    kimiInput.url + '&sig=duplicate',
    'https://www.kimi.com/other.jpg'
  ])('retains manual mode and rejects redirected metadata for unsigned route %#', async (url) => {
    const deps = kimiDependencies();
    await expect(fetchAIChatImage({ ...kimiInput, url }, kimiSender, deps)).rejects.toMatchObject({
      code: 'AI_CHAT_IMAGE_REDIRECT'
    });
    expect(deps.fetch).toHaveBeenCalledExactlyOnceWith(
      url,
      expect.objectContaining({ redirect: 'manual', credentials: 'omit' })
    );
  });

  it('rejects a wrong sender source before allowing redirect or fetching', async () => {
    const deps = kimiDependencies();
    await expect(
      fetchAIChatImage(kimiInput, { ...kimiSender, url: 'https://www.kimi.com/chat/other' }, deps)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SOURCE' });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('rejects navigation while an allowed redirect body is being acquired', async () => {
    const deps = kimiDependencies();
    deps.resolveSourceDocument = vi
      .fn()
      .mockResolvedValueOnce(kimiActive)
      .mockResolvedValueOnce({ ...kimiActive, documentId: 'replacement' });
    await expect(fetchAIChatImage(kimiInput, kimiSender, deps)).rejects.toMatchObject({
      code: 'AI_CHAT_IMAGE_SOURCE'
    });
  });

  it('retains the byte cap after a permitted redirect and cancels overflow', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(AI_CHAT_IMAGE_MAX_BYTES + 1));
      },
      cancel
    });
    await expect(
      fetchAIChatImage(kimiInput, kimiSender, kimiDependencies(kimiResponse(kimiFinal, body)))
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SIZE' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('retains the resource deadline and cancellation after a permitted redirect', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const deps = kimiDependencies(kimiResponse(kimiFinal, new ReadableStream({ cancel })));
    const pending = expect(fetchAIChatImage(kimiInput, kimiSender, deps)).rejects.toMatchObject({
      timedOut: true
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
