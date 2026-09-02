'use strict';

const probeImageSize = require('probe-image-size/sync');

const svgRootPattern = /<svg\s([^>"']|"[^"]*"|'[^']*')*>/;
const svgExtractors = {
  height: /\sheight=(['"])([^%]+?)\1/,
  viewBox: /\sviewBox=(['"])(.+?)\1/i,
  width: /\swidth=(['"])([^%]+?)\1/
};
const unitScale = {
  in: 96,
  cm: 96 / 2.54,
  em: 16,
  ex: 8,
  m: (96 / 2.54) * 100,
  mm: 96 / 2.54 / 10,
  pc: 96 / 72 / 12,
  pt: 96 / 72,
  px: 1
};
const svgLengthPattern = new RegExp(`^([0-9.]+(?:e\\d+)?)(${Object.keys(unitScale).join('|')})?$`);

function parseSvgLength(value) {
  const match = svgLengthPattern.exec(value);
  if (!match) return undefined;
  const scaled = Number(match[1]) * (unitScale[match[2]] || 1);
  return Number.isFinite(scaled) && scaled > 0 ? Math.round(scaled) : undefined;
}

function parseCompatibleSvg(input) {
  const prefix = Buffer.from(input).toString('utf8', 0, 1000);
  const root = prefix.match(svgRootPattern);
  if (!root) return undefined;

  const widthMatch = root[0].match(svgExtractors.width);
  const heightMatch = root[0].match(svgExtractors.height);
  const viewBoxMatch = root[0].match(svgExtractors.viewBox);
  const width = widthMatch && parseSvgLength(widthMatch[2]);
  const height = heightMatch && parseSvgLength(heightMatch[2]);

  if (width && height) return { width, height, type: 'svg' };
  if (!viewBoxMatch) return undefined;

  const bounds = viewBoxMatch[2].trim().split(/[\s,]+/u);
  if (bounds.length !== 4) return undefined;
  const viewBoxWidth = parseSvgLength(bounds[2]);
  const viewBoxHeight = parseSvgLength(bounds[3]);
  if (!viewBoxWidth || !viewBoxHeight) return undefined;
  const ratio = viewBoxWidth / viewBoxHeight;
  if (width) return { width, height: Math.floor(width / ratio), type: 'svg' };
  if (height) return { width: Math.floor(height * ratio), height, type: 'svg' };
  return { width: viewBoxWidth, height: viewBoxHeight, type: 'svg' };
}

function parseCompatibleFriedPng(input) {
  const data = Buffer.from(input);
  if (data.length < 40) return undefined;
  if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return undefined;
  }
  if (data.toString('ascii', 12, 16) !== 'CgBI') return undefined;
  if (data.toString('ascii', 28, 32) !== 'IHDR') return undefined;
  const width = data.readUInt32BE(32);
  const height = data.readUInt32BE(36);
  if (width === 0 || height === 0) return undefined;
  return { width, height, type: 'png' };
}

module.exports = function imageSizeCompatibilityAdapter(input) {
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) {
    throw new TypeError('Image metadata input must be a Buffer or Uint8Array');
  }
  const compatibleFriedPng = parseCompatibleFriedPng(input);
  if (compatibleFriedPng) return compatibleFriedPng;
  const metadata = probeImageSize(input);
  if (metadata?.type === 'svg') {
    const compatibleSvg = parseCompatibleSvg(input);
    if (compatibleSvg) return compatibleSvg;
    throw new TypeError('Invalid SVG metadata');
  }
  if (metadata) {
    const { width, height, type } = metadata;
    if (!Number.isFinite(width) || !Number.isFinite(height) || !type) {
      throw new TypeError('Invalid image metadata');
    }
    return { width, height, type };
  }
  const compatibleSvg = parseCompatibleSvg(input);
  if (compatibleSvg) return compatibleSvg;
  throw new TypeError('Unsupported or invalid image metadata');
};
