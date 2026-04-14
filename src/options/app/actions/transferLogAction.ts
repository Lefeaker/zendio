import type { IOptionsRepository } from '@shared/repositories';

export interface TransferLogEntry {
  lastAction: 'copy' | 'import';
  timestamp: number;
}

export async function persistTransferLogAction(
  lastAction: TransferLogEntry['lastAction'],
  dependencies: {
    optionsRepository: Pick<IOptionsRepository, 'set'>;
    now?: () => number;
  }
): Promise<TransferLogEntry> {
  const entry: TransferLogEntry = {
    lastAction,
    timestamp: (dependencies.now ?? Date.now)()
  };
  await dependencies.optionsRepository.set({
    transferLog: entry
  });
  return entry;
}
