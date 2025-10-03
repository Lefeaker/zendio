import type { Options } from '../store';
import { VaultRouter, type VaultConfig, type ClipContext } from '../vault-router';
import type { ClipPayload } from '../types/messages';

export interface VaultSelectionResult {
  vault: VaultConfig | null;
  restConfig: Options['rest'];
  context: ClipContext;
}

export function buildClipContext(payload: ClipPayload): ClipContext {
  return {
    url: payload.meta?.url ?? '',
    domain: payload.meta?.domain ?? deriveDomain(payload.meta?.url),
    title: payload.title ?? 'Untitled',
    content: payload.markdown.slice(0, 2000),
    type: (payload.type as ClipContext['type']) ?? 'article'
  };
}

export function selectVaultForClip(options: Options, payload: ClipPayload): VaultSelectionResult {
  const context = buildClipContext(payload);
  const defaultRest = options.rest;

  if (!options.vaultRouter || options.vaultRouter.vaults.length === 0) {
    return { vault: null, restConfig: defaultRest, context };
  }

  const router = new VaultRouter(options.vaultRouter);
  const selectedVault = router.selectVault(context);

  if (!selectedVault) {
    return { vault: null, restConfig: defaultRest, context };
  }

  const restConfig: Options['rest'] = {
    baseUrl: selectedVault.httpsUrl || selectedVault.httpUrl || defaultRest.baseUrl,
    httpsUrl: selectedVault.httpsUrl || defaultRest.httpsUrl,
    httpUrl: selectedVault.httpUrl || defaultRest.httpUrl,
    vault: selectedVault.vault,
    apiKey: selectedVault.apiKey,
    rootDir: defaultRest.rootDir
  };

  return { vault: selectedVault, restConfig, context };
}

function deriveDomain(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
