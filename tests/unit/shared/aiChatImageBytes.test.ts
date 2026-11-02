import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AI_CHAT_IMAGE_MAX_BYTES,
  createAIChatImageAttachment,
  readAIChatImageResponse
} from '../../../src/shared/attachments/aiChatImageBytes';
import { AI_CHAT_IMAGE_SAMPLES, imageBytes, imageSample } from './aiChatImageTestSamples';

describe('AI image original bytes', () => {
  it.each(AI_CHAT_IMAGE_SAMPLES)(
    'preserves the actual $extension file and derives its SHA-256 identity',
    async (sample) => {
      const bytes = imageBytes(sample.base64);
      const result = await readAIChatImageResponse(
        new Response(bytes, { headers: { 'content-type': sample.mimeType } }),
        new AbortController().signal
      );
      const hash = createHash('sha256').update(bytes).digest('hex');
      expect(result).toMatchObject({
        id: `ai-image-${hash}`,
        fileName: `ai-image-${hash}.${sample.extension}`,
        mimeType: sample.mimeType
      });
      expect(result.content).toEqual({
        encoding: 'base64',
        data: sample.base64,
        byteLength: bytes.length
      });
    }
  );

  it.each([null, 'application/octet-stream'])(
    'uses the file signature when MIME is %s',
    async (mime) => {
      const sample = imageSample('gif');
      const result = await createAIChatImageAttachment(
        imageBytes(sample.base64),
        mime,
        new AbortController().signal
      );
      expect(result.mimeType).toBe('image/gif');
      expect(result.content.data).toBe(sample.base64);
    }
  );

  it.each(['image/png', 'image/jpeg', 'text/html'])(
    'rejects HTML disguised as %s',
    async (mime) => {
      await expect(
        createAIChatImageAttachment(
          new TextEncoder().encode('<html>Login required</html>'),
          mime,
          new AbortController().signal
        )
      ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_MIME' });
    }
  );

  it('rejects mismatched MIME without changing the GIF into PNG', async () => {
    await expect(
      createAIChatImageAttachment(
        imageBytes(imageSample('gif').base64),
        'image/png',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_MIME' });
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" style="fill:red;stroke:black"/></svg>',
    '<svg><metadata>Created for the image attachment test</metadata><defs><filter id="blur"><feGaussianBlur stdDeviation="2"/><feColorMatrix type="saturate" values="0.5"/><feMerge><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect filter="url(#blur)" width="10" height="10"/></svg>',
    '<svg><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><path style="fill:url(&quot;#paint&quot;);stroke:rgb(0,0,0);stroke-width:2" d="M0 0h10v10z"/></svg>',
    '<svg><text x="&#49;" y="&#x32;">&#169; &#x1F7E6; &amp; test</text><use href="&#35;shape"/><path id="shape" d="M0 0h1"/></svg>'
  ])('preserves supported static SVG bytes and their original hash', async (svg) => {
    const bytes = new TextEncoder().encode(svg);
    const result = await createAIChatImageAttachment(
      bytes,
      'image/svg+xml',
      new AbortController().signal
    );
    const hash = createHash('sha256').update(bytes).digest('hex');
    expect(result).toMatchObject({
      id: `ai-image-${hash}`,
      fileName: `ai-image-${hash}.svg`,
      mimeType: 'image/svg+xml',
      content: {
        encoding: 'base64',
        data: Buffer.from(bytes).toString('base64'),
        byteLength: bytes.length
      }
    });
  });

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><use href="https://example.com/image.svg#shape"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///tmp/x">]><svg>&x;</svg>',
    '<svg><foreignObject><html/></foreignObject></svg>',
    '<svg><g></svg>',
    '<svg style="fill:url(https://example.com/x)"></svg>',
    '<svg style="fill:u&#114;l(https://example.com/x)"></svg>',
    '<svg><use href="&#104;ttps://example.com/x#shape"/></svg>',
    '<svg><filter><feImage href="https://example.com/x"/></filter></svg>',
    '<svg xmlns:p="http://www.w3.org/1999/xlink"><use p:href="https://example.com/x"/></svg>',
    '<svg style="fill:red;behavior:url(#shape)"></svg>',
    '<svg style="fill:expression(alert(1))"></svg>',
    '<svg style="fill:u/**/rl(https://example.com/x)"></svg>',
    '<svg style="fill:var(--external)"></svg>',
    '<svg><text>&#0;</text></svg>',
    '<svg><text>&#xD800;</text></svg>',
    '<svg><text>&#x110000;</text></svg>',
    '<svg><text>&undefined;</text></svg>'
  ])('rejects active, external, or malformed SVG without executing it', async (svg) => {
    await expect(
      createAIChatImageAttachment(
        new TextEncoder().encode(svg),
        'image/svg+xml',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_MIME' });
  });

  it('rejects known oversized responses before reading and cancels their body', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: {
        'content-type': 'image/png',
        'content-length': String(AI_CHAT_IMAGE_MAX_BYTES + 1)
      }
    });
    await expect(
      readAIChatImageResponse(response, new AbortController().signal)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SIZE' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('bounds a chunked body with no length header and cancels on overflow', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(AI_CHAT_IMAGE_MAX_BYTES));
          controller.enqueue(new Uint8Array(1));
        },
        cancel
      }),
      { headers: { 'content-type': 'image/png' } }
    );
    await expect(
      readAIChatImageResponse(response, new AbortController().signal)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_SIZE' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels a stalled reader when the caller aborts', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const pending = readAIChatImageResponse(
      new Response(new ReadableStream({ cancel })),
      controller.signal
    );
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects redirect and HTTP failure responses distinctly', async () => {
    await expect(
      readAIChatImageResponse(new Response(null, { status: 302 }), new AbortController().signal)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_REDIRECT' });
    await expect(
      readAIChatImageResponse(new Response(null, { status: 403 }), new AbortController().signal)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_HTTP', status: 403 });
  });

  it('rejects redirected metadata by default and only accepts a caller-validated final response', async () => {
    const sample = imageSample('jpg');
    const response = () => {
      const result = new Response(imageBytes(sample.base64), {
        headers: { 'content-type': sample.mimeType }
      });
      vi.spyOn(result, 'redirected', 'get').mockReturnValue(true);
      return result;
    };
    await expect(
      readAIChatImageResponse(response(), new AbortController().signal)
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_REDIRECT' });
    const attachment = await readAIChatImageResponse(
      response(),
      new AbortController().signal,
      true
    );
    expect(attachment.content.data).toBe(sample.base64);
    await expect(
      readAIChatImageResponse(
        new Response(null, { status: 307 }),
        new AbortController().signal,
        true
      )
    ).rejects.toMatchObject({ code: 'AI_CHAT_IMAGE_REDIRECT' });
  });
});
