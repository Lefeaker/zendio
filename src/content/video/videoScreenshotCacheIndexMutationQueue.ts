import type { StorageAreaService } from '../../platform/interfaces/storage';

const mutationChains = new WeakMap<StorageAreaService, Promise<void>>();

export async function runSerializedVideoScreenshotCacheIndexMutation<T>(
  area: StorageAreaService,
  operation: () => Promise<T>
): Promise<T> {
  const previous = mutationChains.get(area) ?? Promise.resolve();
  const current = previous.then(operation, operation);
  mutationChains.set(
    area,
    current.then(
      () => undefined,
      () => undefined
    )
  );
  return current;
}
