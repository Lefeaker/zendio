import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';

const STORAGE_KEY = 'ai2ob.localVaultPermissionPromptSuppressions.v1';

type PromptSuppressions = Record<string, { suppressedAt: number }>;

function getStorage(): PlatformServices['storage']['local'] {
  return getService<PlatformServices>(TOKENS.platformServices).storage.local;
}

async function readSuppressions(): Promise<PromptSuppressions> {
  const stored = await getStorage().get<PromptSuppressions>(STORAGE_KEY);
  if (!stored || typeof stored !== 'object') {
    return {};
  }
  return stored;
}

export async function isLocalVaultPermissionPromptSuppressed(folderId: string): Promise<boolean> {
  const suppressions = await readSuppressions();
  return Boolean(suppressions[folderId]);
}

export async function suppressLocalVaultPermissionPrompt(folderId: string): Promise<void> {
  const suppressions = await readSuppressions();
  suppressions[folderId] = { suppressedAt: Date.now() };
  await getStorage().set(STORAGE_KEY, suppressions);
}

export async function clearLocalVaultPermissionPromptSuppression(
  folderId: string | undefined
): Promise<void> {
  if (!folderId) {
    return;
  }
  const suppressions = await readSuppressions();
  if (!suppressions[folderId]) {
    return;
  }
  delete suppressions[folderId];
  await getStorage().set(STORAGE_KEY, suppressions);
}
