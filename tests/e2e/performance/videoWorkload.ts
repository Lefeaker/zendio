import { expect, type Page } from '@playwright/test';

export type EncodingSample = { durationMs: number; width: number; height: number; bytes: number };

declare global {
  // eslint-disable-next-line no-var -- Isolated-world probe state is an optional global property.
  var __performanceEncodings: EncodingSample[] | undefined;
}

// Native canvas -> MediaStream -> video; only media input is controlled. The
// production drawImage, resizing, toBlob, IDB, export and Downloads stay intact.
export async function installVideoFrames(page: Page) {
  await page.evaluate(async () => {
    const video = document.querySelector('video');
    if (!video) throw new Error('Missing workload video');
    const canvas = document.createElement('canvas');
    canvas.id = 'performance-video-source';
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.hidden = true;
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No native canvas context');
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 271828;
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[offset] = seed & 255;
      pixels.data[offset + 1] = (seed >>> 8) & 255;
      pixels.data[offset + 2] = (seed >>> 16) & 255;
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    video.srcObject = canvas.captureStream(10);
    video.muted = true;
    await video.play();
  });
  await expect
    .poll(() =>
      page.locator('video').evaluate((video: HTMLVideoElement) => ({
        width: video.videoWidth,
        height: video.videoHeight,
        ready: video.readyState >= 2
      }))
    )
    .toEqual({ width: 1920, height: 1080, ready: true });
}

export async function installEncodingProbe(extensionPage: Page, tabId: number) {
  await extensionPage.evaluate(async (id) => {
    await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => {
        const state = globalThis;
        state.__performanceEncodings = [];
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the native method; .call(this, ...) below supplies the current canvas.
        const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (
          this: HTMLCanvasElement,
          callback,
          type,
          quality
        ) {
          const started = performance.now();
          const width = this.width;
          const height = this.height;
          nativeToBlob.call(
            this,
            (blob) => {
              state.__performanceEncodings?.push({
                durationMs: performance.now() - started,
                width,
                height,
                bytes: blob?.size ?? 0
              });
              callback(blob);
            },
            type,
            quality
          );
        };
      }
    });
  }, tabId);
}

export async function readEncodingProbe(extensionPage: Page, tabId: number) {
  const results = await extensionPage.evaluate(
    async (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => globalThis.__performanceEncodings ?? []
      }),
    tabId
  );
  return results[0]?.result ?? [];
}

export async function advanceVideoFrame(page: Page, index: number) {
  await page.evaluate(async (frame) => {
    const video = document.querySelector('video');
    const canvas = document.querySelector<HTMLCanvasElement>('#performance-video-source');
    const context = canvas?.getContext('2d');
    if (!video || !context) throw new Error('Missing video frame source');
    context.fillStyle = '#ffffff';
    context.fillRect(20, 20, 700, 110);
    context.fillStyle = '#113377';
    context.font = 'bold 60px sans-serif';
    context.fillText(`Measured frame ${frame}`, 40, 100);
    await video.play();
    await new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve()));
  }, index);
}
