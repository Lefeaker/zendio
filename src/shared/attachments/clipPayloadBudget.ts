// Chromium messaging caps JSON at 64 MiB; reserve 4 MiB for transport overhead.
export const MAX_CLIP_RESULT_BYTES = 60 * 1024 * 1024;

/** Count UTF-8 bytes without allocating a second potentially huge binary buffer. */
export function isClipResultWithinTransportBudget(payload: {
  markdown: string;
  title?: string | undefined;
  type?: string | undefined;
  meta?: object | undefined;
}): boolean {
  const json = JSON.stringify({ type: 'CLIP_RESULT', payload });
  if (json.length > MAX_CLIP_RESULT_BYTES) return false;
  let bytes = 0;
  for (let index = 0; index < json.length; index++) {
    const code = json.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      json.charCodeAt(index + 1) >= 0xdc00 &&
      json.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index++;
    } else bytes += 3;
    if (bytes > MAX_CLIP_RESULT_BYTES) return false;
  }
  return true;
}
