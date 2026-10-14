const EFFECT_DEADLINE_MS = 2_000;

/** Bounds waiting, not cancellation. A late rejection is still observed. */
export async function runBestEffortEffect(action: () => unknown, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = Promise.resolve()
    .then(action)
    .then(
      () => undefined,
      () => {
        console.warn('[BestEffortEffect] Failed:', label);
      }
    );
  try {
    await Promise.race([
      settled,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, EFFECT_DEADLINE_MS);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
