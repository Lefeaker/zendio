export function normalizeVideoTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function approximatelyEqualVideoTime(
  left: number,
  right: number,
  tolerance: number
): boolean {
  return Math.abs(normalizeVideoTime(left) - normalizeVideoTime(right)) <= tolerance;
}
