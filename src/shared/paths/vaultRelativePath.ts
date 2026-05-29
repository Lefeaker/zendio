export interface NormalizeVaultRelativePathOptions {
  vaultName?: string;
  allowEmpty?: boolean;
}

export function normalizeVaultRelativePath(
  input: string,
  options: NormalizeVaultRelativePathOptions = {}
): string {
  const normalizedInput = input.replace(/\\/g, '/').replace(/^\/+/, '');
  const vaultName = options.vaultName?.trim();
  const segments = normalizedInput
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (vaultName && segments[0] === vaultName) {
    segments.shift();
  }

  if (segments.length === 0) {
    if (options.allowEmpty === true) {
      return '';
    }
    throw new Error('Vault-relative path must not be empty.');
  }

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Vault-relative path must not contain traversal segments.');
  }

  return segments.join('/');
}
