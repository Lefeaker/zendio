import type { LearningReceipt } from '../shared/learningProgress';
import type { DownloadsService } from '../platform/interfaces/downloads';
import type { INavigationRepository } from '../shared/repositories/INavigationRepository';

export function learningResultPath(receipt: LearningReceipt): string {
  return [receipt.vaultName, receipt.filePath].filter(Boolean).join(' / ');
}

export async function copyLearningPath(receipt: LearningReceipt): Promise<void> {
  await navigator.clipboard.writeText(learningResultPath(receipt));
}

export async function revealLearningResult(
  receipt: LearningReceipt,
  navigation: INavigationRepository,
  downloads?: DownloadsService
): Promise<void> {
  if (receipt.destination === 'downloads' && receipt.downloadId !== undefined && downloads?.show) {
    await downloads.show(receipt.downloadId);
  } else if (receipt.destination === 'vault' && receipt.vaultName) {
    await navigation.openVault(
      'obsidian://open?vault=' +
        encodeURIComponent(receipt.vaultName) +
        '&file=' +
        encodeURIComponent(receipt.filePath)
    );
  } else throw new Error('Saved result cannot be revealed');
}
