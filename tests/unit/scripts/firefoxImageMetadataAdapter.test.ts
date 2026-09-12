import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

type ImageMetadata = { width: number; height: number; type: string };
type ImageSizeAdapter = (input: Buffer | Uint8Array) => ImageMetadata;

const require = createRequire(import.meta.url);
const imageSize =
  require('../../../tools/addons-linter-image-metadata-adapter/index.cjs') as ImageSizeAdapter;

function svg(attributes: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}></svg>`);
}

function friedPng(width: number, height: number): Buffer {
  const data = Buffer.alloc(40);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data, 0);
  data.write('CgBI', 12, 'ascii');
  data.write('IHDR', 28, 'ascii');
  data.writeUInt32BE(width, 32);
  data.writeUInt32BE(height, 36);
  return data;
}

const binaryRows: Array<[string, string, ImageMetadata]> = [
  [
    'png',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    { width: 1, height: 1, type: 'png' }
  ],
  ['gif', 'R0lGODlhAQABAAAAACwAAAAAAQABAAA=', { width: 1, height: 1, type: 'gif' }],
  [
    'jpeg',
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=',
    { width: 1, height: 1, type: 'jpg' }
  ],
  [
    'webp-lossy',
    'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==',
    { width: 1, height: 1, type: 'webp' }
  ],
  [
    'webp-lossless',
    'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
    { width: 1, height: 1, type: 'webp' }
  ]
];

const svgRows: Array<[string, Buffer, ImageMetadata]> = [
  ['quoted-pixels', svg('width="64" height="32"'), { width: 64, height: 32, type: 'svg' }],
  ['single-quotes', svg("width='48' height='24'"), { width: 48, height: 24, type: 'svg' }],
  ['px', svg('width="96px" height="48px"'), { width: 96, height: 48, type: 'svg' }],
  ['pt', svg('width="72pt" height="36pt"'), { width: 96, height: 48, type: 'svg' }],
  ['pc', svg('width="12pc" height="6pc"'), { width: 1, height: 1, type: 'svg' }],
  ['in', svg('width="2in" height="1in"'), { width: 192, height: 96, type: 'svg' }],
  ['cm', svg('width="2.54cm" height="1.27cm"'), { width: 96, height: 48, type: 'svg' }],
  ['mm', svg('width="25.4mm" height="12.7mm"'), { width: 96, height: 48, type: 'svg' }],
  ['em', svg('width="4em" height="2em"'), { width: 64, height: 32, type: 'svg' }],
  ['ex', svg('width="4ex" height="2ex"'), { width: 32, height: 16, type: 'svg' }],
  ['viewbox-only', svg('viewBox="0 0 80 40"'), { width: 80, height: 40, type: 'svg' }],
  ['viewbox-case', svg('viewbox="0 0 70 35"'), { width: 70, height: 35, type: 'svg' }],
  [
    'width-viewbox',
    svg('width="100" viewBox="0 0 50 25"'),
    { width: 100, height: 50, type: 'svg' }
  ],
  [
    'height-viewbox',
    svg('height="60" viewBox="0 0 50 25"'),
    { width: 120, height: 60, type: 'svg' }
  ],
  ['scientific', svg('width="1e2" height="5e1"'), { width: 100, height: 50, type: 'svg' }],
  ['leading-decimal', svg('width=".5in" height=".25in"'), { width: 48, height: 24, type: 'svg' }],
  [
    'root-extra-quoted',
    Buffer.from('<svg data-label="a > b" width="42" height="21"></svg>'),
    { width: 42, height: 21, type: 'svg' }
  ],
  [
    'xml-prefix',
    Buffer.from('<?xml version="1.0"?><svg width="40" height="20"></svg>'),
    { width: 40, height: 20, type: 'svg' }
  ],
  [
    'newline-root',
    Buffer.from('<svg\n width="36" height="18"></svg>'),
    { width: 36, height: 18, type: 'svg' }
  ],
  [
    'tab-root',
    Buffer.from('<svg\twidth="34" height="17"></svg>'),
    { width: 34, height: 17, type: 'svg' }
  ],
  ['decimal-rounding', svg('width="10.4" height="5.6"'), { width: 10, height: 6, type: 'svg' }],
  ['viewbox-decimal', svg('viewBox="0 0 10.4 5.6"'), { width: 10, height: 6, type: 'svg' }],
  [
    'viewbox-with-width-unit',
    svg('width="1in" viewBox="0 0 2 1"'),
    { width: 96, height: 48, type: 'svg' }
  ],
  [
    'viewbox-with-height-unit',
    svg('height="1in" viewBox="0 0 2 1"'),
    { width: 192, height: 96, type: 'svg' }
  ],
  ['large-viewbox', svg('viewBox="0 0 4096 2048"'), { width: 4096, height: 2048, type: 'svg' }],
  ['uppercase-viewbox', svg('VIEWBOX="0 0 30 15"'), { width: 30, height: 15, type: 'svg' }]
];

describe('Firefox addons-linter image metadata adapter', () => {
  it.each(binaryRows)('matches the accepted $0 metadata contract', (_name, encoded, expected) => {
    expect(imageSize(Buffer.from(encoded, 'base64'))).toEqual(expected);
  });

  it.each(svgRows)('matches the bounded SVG compatibility row $0', (_name, input, expected) => {
    expect(imageSize(input)).toEqual(expected);
  });

  it('preserves the Apple CgBI PNG header placement', () => {
    expect(imageSize(friedPng(57, 29))).toEqual({ width: 57, height: 29, type: 'png' });
  });

  it.each([
    Buffer.from('not-an-image'),
    Buffer.from('<svg width="50%" height="25%"></svg>'),
    Buffer.from('<svg viewBox="0 0 nope 10"></svg>'),
    Buffer.alloc(1024 * 1024),
    Buffer.alloc(16 * 1024 * 1024)
  ])('fails closed for invalid or unsupported metadata without unbounded scanning', (input) => {
    const startedAt = performance.now();
    expect(() => imageSize(input)).toThrow();
    expect(performance.now() - startedAt).toBeLessThan(250);
  });
});
