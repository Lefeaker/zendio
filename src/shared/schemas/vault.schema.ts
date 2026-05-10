import { z } from 'zod';

export const RoutingRuleTypeSchema = z.enum(['domain', 'keyword', 'url-pattern']);

export const RoutingRuleSchema = z.object({
  id: z.string().min(1),
  vaultId: z.string().min(1),
  type: RoutingRuleTypeSchema,
  pattern: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  description: z.string().optional()
});

export const VaultConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  httpsUrl: z.string(),
  httpUrl: z.string(),
  vault: z.string().min(1),
  apiKey: z.string(),
  localFolderId: z.string().optional(),
  localFolderName: z.string().optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
  rules: z.array(RoutingRuleSchema).optional()
});

export const VaultRouterConfigSchema = z.object({
  vaults: z.array(VaultConfigSchema),
  rules: z.array(RoutingRuleSchema).optional(),
  defaultVaultId: z.string().optional()
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;
export type VaultConfig = z.infer<typeof VaultConfigSchema>;
export type VaultRouterConfig = z.infer<typeof VaultRouterConfigSchema>;
