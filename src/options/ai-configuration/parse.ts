import { z } from 'zod';
import type { CompleteOptions } from '@shared/types/options';
import { parseBoundedJson } from '@shared/config/losslessObjectBoundary';
import type { PlainStructuredValue } from '@shared/config/losslessObjectBoundaryTypes';
import { applyStoredOptionsPatch, decodeStoredOptions } from '@shared/config/storedOptionsCodec';
import { resolveCanonicalVaultId } from '@shared/config/vaultRouterIdentity';
import { createOptionsPatch, readOptionsPath, type OptionsPath } from '../state/optionsPatchModel';
import { areStateValuesEqual } from '../state/stateValue';
import { AI_CONFIG_FIELDS } from './catalog';
import { AiConfigInputError, type AiConfigReview, type AiConfigChange } from './types';
import { AiYamlSchema, mergeAiYaml } from './yaml';
import { AiRulesSchema, AiVaultsSchema, mergeAiVaults, publicAiVaults } from './vaults';
import { validateAiNoteTemplate, validateAiScreenshotTemplates } from './validation';

const envelope = z
  .object({
    format: z.literal('zendio-ai-config'),
    version: z.literal(1),
    changes: z.record(z.unknown())
  })
  .strict();
const scalar = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const mappings = z.record(z.string().min(1), z.string().min(1));

function checkKeys(value: PlainStructuredValue): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new AiConfigInputError('aiConfigUnknownField', key);
    checkKeys(child);
  }
}

export function readAiConfiguration(text: string) {
  if (new TextEncoder().encode(text).byteLength > 65_536)
    throw new AiConfigInputError('aiConfigInvalidFormat');
  let source = text.trim();
  if (!source.startsWith('{')) {
    const blocks = [...source.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
    if (blocks.length !== 1) throw new AiConfigInputError('aiConfigInvalidFormat');
    source = blocks[0]?.[1] ?? '';
  }
  const parsed = parseBoundedJson(source);
  if (parsed.ok) checkKeys(parsed.value);
  const checked = parsed.ok ? envelope.safeParse(parsed.value) : null;
  if (!checked?.success || Object.keys(checked.data.changes).length > 100)
    throw new AiConfigInputError('aiConfigInvalidFormat');
  return checked.data.changes;
}

export function reviewAiConfiguration(text: string, current: CompleteOptions): AiConfigReview {
  const changes = readAiConfiguration(text);
  const review: AiConfigReview = { patches: [], expected: [], rows: [] };
  let candidate = structuredClone(current);
  const add = (
    path: OptionsPath,
    value: string | number | boolean | object,
    label: AiConfigChange['label'],
    visible = true
  ) => {
    const before = readOptionsPath(current, path);
    if (areStateValuesEqual(before, value)) return;
    const patch = createOptionsPatch(path, value);
    const applied = applyStoredOptionsPatch(candidate, patch);
    if (!applied.success) throw new AiConfigInputError('aiConfigInvalidField', path.join('.'));
    candidate = decodeStoredOptions(applied.value).runtime;
    review.patches.push(patch);
    review.expected.push(createOptionsPatch(path, before));
    if (visible) review.rows.push({ field: path.join('.'), label, before, after: value });
  };
  for (const [key, value] of Object.entries(changes)) {
    const field = AI_CONFIG_FIELDS.find((entry) => entry.path.join('.') === key);
    if (field) {
      if (key.startsWith('templates.')) {
        if (typeof value !== 'string') throw new AiConfigInputError('aiConfigInvalidField', key);
        validateAiNoteTemplate(value, key);
      }
      if (
        key === 'fragmentClipper.selectionModifierKeys' &&
        (!Array.isArray(value) || value.length !== 1)
      )
        throw new AiConfigInputError('aiConfigInvalidField', key);
      const parsed = scalar.safeParse(value);
      if (!parsed.success) throw new AiConfigInputError('aiConfigInvalidField', key);
      add(field.path, parsed.data, field.label);
    } else if (key === 'domainMappings') {
      const parsed = mappings.safeParse(value);
      if (!parsed.success) throw new AiConfigInputError('aiConfigInvalidField', key);
      add(['domainMappings'], { ...current.domainMappings, ...parsed.data }, 'domainMappingTitle');
    } else if (key === 'yamlConfig') {
      const parsed = AiYamlSchema.safeParse(value);
      if (!parsed.success) throw new AiConfigInputError('aiConfigInvalidField', key);
      add(['yamlConfig'], mergeAiYaml(current.yamlConfig, parsed.data), 'yamlConfigTitle');
    } else if (!['vaultRouter.vaults', 'vaultRouter.rules'].includes(key)) {
      throw new AiConfigInputError('aiConfigUnknownField', key);
    }
  }
  if ('vaultRouter.vaults' in changes || 'vaultRouter.rules' in changes) {
    const vaults = AiVaultsSchema.safeParse(
      'vaultRouter.vaults' in changes ? changes['vaultRouter.vaults'] : []
    );
    const rules = AiRulesSchema.safeParse(
      'vaultRouter.rules' in changes ? changes['vaultRouter.rules'] : []
    );
    if (!vaults.success || !rules.success)
      throw new AiConfigInputError('aiConfigInvalidField', 'vaultRouter');
    if (vaults.data.length || rules.data.length) {
      const next = mergeAiVaults(current, vaults.data, rules.data);
      const publicRouter = (options: CompleteOptions) => ({
        vaults: publicAiVaults(options),
        rules: [
          ...(options.vaultRouter?.rules ?? []),
          ...(options.vaultRouter?.vaults.flatMap((vault) => vault.rules ?? []) ?? [])
        ]
      });
      const before = publicRouter(current);
      const after = publicRouter({ ...current, vaultRouter: next });
      add(['vaultRouter'], next, 'schemaStorageTitle', false);
      if (!areStateValuesEqual(before, after))
        review.rows.push({ field: 'vaultRouter', label: 'schemaStorageTitle', before, after });
      const defaultId = resolveCanonicalVaultId(next);
      const input = vaults.data.find(({ id }) => id === '$default' || id === defaultId);
      const defaultVault = next.vaults.find(({ id }) => id === defaultId);
      if (input && defaultVault) {
        if (input.name !== undefined || input.vault !== undefined)
          add(['rest', 'vault'], defaultVault.vault, 'vaultNameLabel', false);
        if (input.httpsUrl !== undefined)
          add(['rest', 'httpsUrl'], defaultVault.httpsUrl, 'schemaStorageTitle', false);
        if (input.httpUrl !== undefined)
          add(['rest', 'httpUrl'], defaultVault.httpUrl, 'schemaStorageTitle', false);
      }
    }
  }
  if (Object.keys(changes).some((key) => key.startsWith('video.screenshotAttachment.')))
    validateAiScreenshotTemplates(candidate);
  return review;
}
