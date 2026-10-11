import { configProvider } from './config/provider';
import type { ClipPayload } from './types';
import type { ClassificationResult } from './schemas/classification.schema';
import type { OptionsState, TemplateOptions } from './types/options';
import type { ClipContext, VaultConfig } from './types/vault';
import { getDefaultRoutingVault, selectMatchingVault } from './vaultRouting';
import { toDownloadsFilename } from './downloadsFilename';
import { tryParseUrl } from './url';

export type ExportDestinationKind = 'vault' | 'downloads';

export interface ExportDestinationSelection {
  kind: ExportDestinationKind;
  vaultId?: string;
}

export interface ExportDestinationOption {
  id: string;
  kind: ExportDestinationKind;
  label: string;
  path: string;
  selected: boolean;
}

export interface ExportDestinationPreview {
  kind: ExportDestinationKind;
  id: string;
  label: string;
  path: string;
  hasConfiguredVault: boolean;
  setupUrl?: string;
  options: ExportDestinationOption[];
}

export interface ExportDestinationMetadata {
  kind: ExportDestinationKind;
  vaultId?: string;
}

export type TemplateKey = 'article' | 'video' | 'fragment' | 'reading' | 'ai';

const TEMPLATE_DEFAULTS = configProvider.getTemplates();

export const DOWNLOADS_DESTINATION_ID = 'downloads';
export const VAULT_SETTINGS_SECTION = 'section-storage';
export const DEFAULT_SETUP_URL = `options/index.html#${VAULT_SETTINGS_SECTION}`;

export { toDownloadsFilename };

export function createExportDestinationMetadata(
  selection: ExportDestinationSelection
): ExportDestinationMetadata {
  return selection.kind === 'vault'
    ? { kind: 'vault', ...(selection.vaultId ? { vaultId: selection.vaultId } : {}) }
    : { kind: 'downloads' };
}

export function parseExportDestinationMetadata(value: unknown): ExportDestinationSelection | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<ExportDestinationMetadata>;
  if (candidate.kind === 'downloads') {
    return { kind: 'downloads' };
  }
  if (candidate.kind === 'vault') {
    return { kind: 'vault', ...(candidate.vaultId ? { vaultId: candidate.vaultId } : {}) };
  }
  return null;
}

export function parseExportDestinationId(id: string): ExportDestinationSelection {
  if (id === DOWNLOADS_DESTINATION_ID) {
    return { kind: 'downloads' };
  }
  return { kind: 'vault', vaultId: id };
}

export function buildExportDestinationPreview(args: {
  options: OptionsState;
  payload: ClipPayload;
  selection?: ExportDestinationSelection | null;
  setupUrl?: string;
}): ExportDestinationPreview {
  const configuredVaults = getConfiguredVaults(args.options);
  const hasConfiguredVault = hasConfiguredVaultTarget(args.options, configuredVaults);
  const fallbackPath = resolveExportPath(
    args.options.templates,
    args.payload,
    {
      status: 'fallback',
      fallbackReason: 'disabled',
      topics: [],
      tags: [],
      ...(args.payload.type !== undefined && { type: args.payload.type }),
      ...(args.payload.meta?.platform !== undefined && { ai_platform: args.payload.meta.platform })
    },
    args.options.domainMappings
  );
  const downloadsPath = toDownloadsFilename(fallbackPath);

  const routedVault = selectVaultForPreview(args.options, args.payload, configuredVaults);
  const requestedSelection = args.selection ?? null;
  const selected =
    requestedSelection?.kind === 'vault' && hasConfiguredVault
      ? requestedSelection
      : requestedSelection?.kind === 'downloads'
        ? requestedSelection
        : hasConfiguredVault
          ? { kind: 'vault' as const, ...(routedVault?.id ? { vaultId: routedVault.id } : {}) }
          : { kind: 'downloads' as const };

  const vaultOptions: ExportDestinationOption[] = configuredVaults.map((vault) => ({
    id: vault.id,
    kind: 'vault',
    label: vault.name || vault.vault,
    path: fallbackPath,
    selected: selected.kind === 'vault' && selected.vaultId === vault.id
  }));

  const defaultRestOption: ExportDestinationOption | null =
    configuredVaults.length === 0 && isRestConfigured(args.options)
      ? {
          id: 'default-vault',
          kind: 'vault',
          label: args.options.rest.vault,
          path: fallbackPath,
          selected: selected.kind === 'vault'
        }
      : null;

  const downloadsOption: ExportDestinationOption = {
    id: DOWNLOADS_DESTINATION_ID,
    kind: 'downloads',
    label: 'Downloads',
    path: downloadsPath,
    selected: selected.kind === 'downloads'
  };

  const options = [
    ...vaultOptions,
    ...(defaultRestOption ? [defaultRestOption] : []),
    downloadsOption
  ];
  const selectedOption = options.find((option) => option.selected) ?? downloadsOption;

  return {
    kind: selectedOption.kind,
    id: selectedOption.id,
    label: selectedOption.label,
    path: selectedOption.path,
    hasConfiguredVault,
    ...(!hasConfiguredVault ? { setupUrl: args.setupUrl ?? DEFAULT_SETUP_URL } : {}),
    options
  };
}

export function resolveExportPath(
  templates: TemplateOptions,
  payload: ClipPayload,
  classification: Partial<ClassificationResult> = {},
  domainMappings?: Record<string, string>
): string {
  const createdAt = new Date();
  const yyyy = createdAt.getFullYear();
  const monthTwoDigit = String(createdAt.getMonth() + 1).padStart(2, '0');
  const dd = String(createdAt.getDate()).padStart(2, '0');
  const hourTwoDigit = String(createdAt.getHours()).padStart(2, '0');
  const minuteTwoDigit = String(createdAt.getMinutes()).padStart(2, '0');
  const secondTwoDigit = String(createdAt.getSeconds()).padStart(2, '0');
  const title = payload.title || 'Untitled';
  const template = getTemplateValue(templates, resolveTemplateKeyForPayloadType(payload));
  return populateTemplate(template, {
    platform: String(payload.meta?.platform ?? classification.ai_platform ?? 'clipper'),
    domain: safe(resolveDomain(payload, domainMappings)),
    yyyy: String(yyyy),
    mm: monthTwoDigit,
    dd,
    HH: hourTwoDigit,
    slug: slug(title),
    title: safe(title),
    HHmmss: `${hourTwoDigit}${minuteTwoDigit}${secondTwoDigit}`,
    HHmm: `${hourTwoDigit}${minuteTwoDigit}`,
    ss: secondTwoDigit
  });
}

export function getConfiguredVaults(options: OptionsState): VaultConfig[] {
  return (options.vaultRouter?.vaults ?? []).filter((vault) => vault.enabled !== false);
}

export function hasConfiguredVaultTarget(
  options: OptionsState,
  vaults = getConfiguredVaults(options)
): boolean {
  return (
    vaults.some((vault) => Boolean(vault.localFolderId?.trim() || vault.apiKey?.trim())) ||
    isRestConfigured(options)
  );
}

export function selectVaultForPreview(
  options: OptionsState,
  payload: ClipPayload,
  vaults = getConfiguredVaults(options)
): VaultConfig | null {
  if (!options.vaultRouter || vaults.length === 0) {
    return null;
  }
  const config = { ...options.vaultRouter, vaults };
  return (
    selectMatchingVault(config, buildClipContext(payload))?.vault ?? getDefaultRoutingVault(config)
  );
}

function isRestConfigured(options: OptionsState): boolean {
  return Boolean(options.rest.apiKey?.trim() && options.rest.vault?.trim());
}

function buildClipContext(payload: ClipPayload): ClipContext {
  return {
    url: payload.meta?.url ?? '',
    domain: payload.meta?.domain ?? deriveDomain(payload.meta?.url),
    title: payload.title ?? 'Untitled',
    content: payload.markdown.slice(0, 2000),
    type: payload.type === 'ai_chat' ? 'ai_chat' : 'article'
  };
}

export function resolveTemplateKeyForPayloadType(
  payload: Pick<ClipPayload, 'type' | 'meta'>
): TemplateKey {
  if (payload.type === 'clipper') {
    return payload.meta?.readerMode ? 'reading' : 'fragment';
  }
  if (payload.type === 'video') {
    return 'video';
  }
  return payload.type === 'ai_chat' ? 'ai' : payload.type === 'fragment' ? 'fragment' : 'article';
}

function getTemplateValue(templates: TemplateOptions, key: TemplateKey): string {
  const value = templates[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : TEMPLATE_DEFAULTS[key];
}

function populateTemplate(template: string, values: Record<string, string>): string {
  const tokenEntries = Object.entries(values).sort((a, b) => b[0].length - a[0].length);
  return tokenEntries.reduce(
    (result, [token, value]) => result.replace(new RegExp(`\\{${token}\\}`, 'g'), value ?? ''),
    template
  );
}

function safe(value: string | undefined): string {
  if (!value) return 'note';
  return value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
}

function slug(value: string): string {
  return safe(value).toLowerCase().replace(/\s+/g, '-');
}

function resolveDomain(payload: ClipPayload, domainMappings?: Record<string, string>): string {
  const urlDomain = deriveDomain(payload.meta?.url);
  const domain = payload.meta?.domain || urlDomain || 'unknown';
  return domainMappings?.[domain] ?? domain;
}

function deriveDomain(url?: string): string {
  const parsed = tryParseUrl(url);
  return parsed?.hostname ?? '';
}
