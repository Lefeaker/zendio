// Authored source for the bundled tutorial video. No third-party footage or network inputs.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const width = 640,
  height = 360,
  fps = 8,
  seconds = 24;
const glyphs = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
  '111100111001111',
  '111100111101111',
  '111001001001001',
  '111101111101111',
  '111101111001111'
];
const frames = [];
for (let frame = 0; frame < fps * seconds; frame++) {
  const time = Math.floor(frame / fps);
  const colors = [
    [92, 71, 159],
    [27, 117, 123],
    [164, 82, 76]
  ];
  const color = colors[Math.floor(time / 8)];
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = color[0];
    pixels[i * 3 + 1] = color[1];
    pixels[i * 3 + 2] = color[2];
  }
  function rect(x, y, w, h, rgb) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const i = (yy * width + xx) * 3;
        pixels[i] = rgb[0];
        pixels[i + 1] = rgb[1];
        pixels[i + 2] = rgb[2];
      }
  }
  const text = '00' + String(time).padStart(2, '0');
  [...text].forEach((digit, index) => {
    const x = 124 + index * 94 + (index >= 2 ? 24 : 0);
    [...glyphs[Number(digit)]].forEach((on, cell) => {
      if (on === '1')
        rect(x + (cell % 3) * 20, 115 + Math.floor(cell / 3) * 20, 16, 16, [250, 249, 255]);
    });
  });
  rect(301, 140, 10, 10, [250, 249, 255]);
  rect(301, 180, 10, 10, [250, 249, 255]);
  rect(48, 298, 544, 5, [65, 55, 90]);
  rect(48, 298, Math.max(1, Math.floor((544 * frame) / (fps * seconds))), 5, [250, 249, 255]);
  for (let chapter = 0; chapter < 3; chapter++)
    rect(
      48 + chapter * 30,
      40,
      18,
      6,
      chapter === Math.floor(time / 8) ? [250, 249, 255] : [190, 178, 210]
    );
  frames.push(pixels);
}
const temp = mkdtempSync(join(tmpdir(), 'zendio-practice-video-'));
try {
  const raw = join(temp, 'frames.rgb');
  writeFileSync(raw, Buffer.concat(frames));
  mkdirSync('public/onboarding', { recursive: true });
  const result = spawnSync(
    process.argv[2] ?? 'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgb24',
      '-video_size',
      `${width}x${height}`,
      '-framerate',
      String(fps),
      '-i',
      raw,
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '32',
      '-b:v',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-an',
      'public/onboarding/practice.webm'
    ],
    { stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Practice video encoding failed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
