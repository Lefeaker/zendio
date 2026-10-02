import { z } from 'zod';
import type { CompleteOptions } from '@shared/types/options';
import { resolveCanonicalVaultId } from '@shared/config/vaultRouterIdentity';
import { RoutingRuleSchema, VaultRouterConfigSchema } from '@shared/schemas/vault.schema';
import { AiConfigInputError } from './types';

export const AiVaultsSchema = z
  .array(
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        vault: z.string().min(1).optional(),
        httpsUrl: z.union([z.literal(''), z.string().url()]).optional(),
        httpUrl: z.union([z.literal(''), z.string().url()]).optional(),
        enabled: z.boolean().optional()
      })
      .strict()
  )
  .max(50);
export const AiRulesSchema = z.array(RoutingRuleSchema.strict()).max(100);

export function mergeAiVaults(
  current: CompleteOptions,
  vaults: z.infer<typeof AiVaultsSchema> = [],
  rules: z.infer<typeof AiRulesSchema> = []
) {
  const defaultId = resolveCanonicalVaultId(current.vaultRouter);
  const resolveId = (id: string) => (id === '$default' ? defaultId : id);
  const router: NonNullable<CompleteOptions['vaultRouter']> = structuredClone(
    current.vaultRouter ?? {
      defaultVaultId: defaultId,
      vaults: [
        {
          id: defaultId,
          name: current.rest.vault,
          vault: current.rest.vault,
          httpsUrl: current.rest.httpsUrl ?? current.rest.baseUrl,
          httpUrl: current.rest.httpUrl ?? '',
          apiKey: current.rest.apiKey,
          ...(current.rest.localFolderId ? { localFolderId: current.rest.localFolderId } : {}),
          ...(current.rest.localFolderName
            ? { localFolderName: current.rest.localFolderName }
            : {}),
          isDefault: true,
          enabled: true
        }
      ]
    }
  );
  const ids = vaults.map(({ id }) => resolveId(id));
  if (new Set(ids).size !== ids.length || new Set(rules.map(({ id }) => id)).size !== rules.length)
    throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter');
  for (const input of vaults) {
    const id = resolveId(input.id);
    if (id === defaultId && input.enabled === false)
      throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter.vaults');
    const existing = router.vaults.find((vault) => vault.id === id);
    if (existing) {
      Object.assign(existing, input, { id });
      if (input.name && !input.vault) existing.vault = input.name;
    } else {
      if (!input.name || !input.vault)
        throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter.vaults');
      router.vaults.push({
        ...input,
        id,
        name: input.name,
        vault: input.vault,
        httpsUrl: input.httpsUrl ?? '',
        httpUrl: input.httpUrl ?? '',
        apiKey: '',
        enabled: input.enabled ?? true,
        isDefault: false
      });
    }
  }
  const allRules = [
    ...(router.rules ?? []),
    ...router.vaults.flatMap((vault) => vault.rules ?? [])
  ];
  for (const input of rules) {
    if (!input.pattern.trim())
      throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter.rules');
    if (input.type === 'url-pattern') {
      try {
        new RegExp(input.pattern, 'i');
      } catch {
        throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter.rules');
      }
    }
    const { description, ...required } = input;
    const rule = {
      ...required,
      vaultId: resolveId(input.vaultId),
      ...(description === undefined ? {} : { description })
    };
    const existing = allRules.filter((item) => item.id === rule.id);
    if (existing.length > 1)
      throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter.rules');
    if (existing[0]) Object.assign(existing[0], rule);
    else allRules.push(rule);
  }
  if (allRules.some((rule) => !router.vaults.some((vault) => vault.id === rule.vaultId)))
    throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter.rules');
  delete router.rules;
  for (const vault of router.vaults) {
    const owned = allRules.filter((rule) => rule.vaultId === vault.id);
    if (owned.length || vault.rules) vault.rules = owned;
  }
  if (!VaultRouterConfigSchema.safeParse(router).success)
    throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter');
  return router;
}

/** Public fields only, for review and optional AI context; never expose keys or folder bindings. */
export function publicAiVaults(options: CompleteOptions) {
  return (
    options.vaultRouter?.vaults.map(({ id, name, vault, httpsUrl, httpUrl, enabled }) => ({
      id,
      name,
      vault,
      httpsUrl,
      httpUrl,
      enabled
    })) ?? []
  );
}
