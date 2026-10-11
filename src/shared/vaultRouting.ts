import type { ClipContext, RoutingRule, VaultConfig, VaultRouterConfig } from './types/vault';

/** Shared by the content preview and background writer; no storage or UI dependencies. */
export function selectMatchingVault(
  config: VaultRouterConfig,
  context: ClipContext
): { vault: VaultConfig; rule: RoutingRule } | null {
  const rules = getActiveRoutingRules(config).sort((a, b) => b.priority - a.priority);
  for (const rule of rules) {
    if (!matchesRule(rule, context)) continue;
    const vault = config.vaults.find((candidate) => candidate.id === rule.vaultId);
    if (vault) return { vault, rule };
  }
  return null;
}

export function getDefaultRoutingVault(config: VaultRouterConfig): VaultConfig | null {
  const enabledVaults = config.vaults.filter((vault) => vault.enabled !== false);
  return (
    enabledVaults.find((vault) => vault.id === config.defaultVaultId) ??
    enabledVaults.find((vault) => vault.isDefault) ??
    enabledVaults[0] ??
    null
  );
}

export function getActiveRoutingRules(config: VaultRouterConfig): RoutingRule[] {
  const legacyRules = Array.isArray(config.rules) ? config.rules : [];
  const vaultRules = config.vaults
    .filter((vault) => vault.enabled !== false)
    .flatMap((vault) =>
      (vault.rules ?? []).map((rule) => ({ ...rule, vaultId: rule.vaultId ?? vault.id }))
    );
  const seen = new Set<string>();
  return [...legacyRules, ...vaultRules].filter((rule) => {
    if (rule.id) {
      if (seen.has(rule.id)) return false;
      seen.add(rule.id);
    }
    return (
      rule.enabled &&
      config.vaults.some((vault) => vault.id === rule.vaultId && vault.enabled !== false)
    );
  });
}

function matchesRule(rule: RoutingRule, context: ClipContext): boolean {
  if (rule.type === 'domain') return matchesDomain(rule.pattern, context.domain);
  if (rule.type === 'keyword') {
    const text = `${context.title} ${context.content}`.toLowerCase();
    return rule.pattern
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean)
      .some((keyword) => text.includes(keyword));
  }
  if (rule.type === 'url-pattern') {
    const pattern = rule.pattern.trim();
    if (!pattern) return false;
    try {
      return new RegExp(pattern, 'i').test(context.url);
    } catch {
      return false;
    }
  }
  return false;
}

function matchesDomain(pattern: string, domain: string): boolean {
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain) return false;
  return pattern
    .split(';')
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean)
    .some((candidate) => matchesDomainPattern(candidate, normalizedDomain));
}

function matchesDomainPattern(pattern: string, domain: string): boolean {
  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(domain);
  }
  if (domain === pattern || domain.endsWith(`.${pattern}`)) return true;

  // Preserve the background router's dot-delimited label matching contract.
  const index = domain.indexOf(pattern);
  if (index === -1) return false;
  const afterIndex = index + pattern.length;
  return (
    (index === 0 || domain[index - 1] === '.') &&
    (afterIndex === domain.length || domain[afterIndex] === '.')
  );
}
