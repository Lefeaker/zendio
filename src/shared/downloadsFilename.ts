export function toDownloadsFilename(resolvedPath: string): string {
  return sanitizeDownloadsPathSegment(
    resolvedPath
      .split(/[\\/]+/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .at(-1),
    'note.md'
  );
}

export function sanitizeDownloadsPathSegment(
  segment: string | undefined,
  fallback: string
): string {
  const safeSegment = segment
    ?.trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 180)
    .trim();
  return !safeSegment || safeSegment === '.' || safeSegment === '..' ? fallback : safeSegment;
}
