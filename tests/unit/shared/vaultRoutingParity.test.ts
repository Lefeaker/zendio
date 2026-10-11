import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import {
  buildExportDestinationPreview,
  createExportDestinationMetadata,
  parseExportDestinationId
} from '@shared/exportDestination';
import { selectVaultForClip } from '../../../src/background/services/vaultRouterService';
import type { ClipPayload, RoutingRule, VaultConfig } from '@shared/types';

const vault = (id: string): VaultConfig => ({
  id,
  name: id,
  vault: id,
  apiKey: 'fixture-key',
  httpsUrl: '',
  httpUrl: ''
});

const rule = (overrides: Partial<RoutingRule> = {}): RoutingRule => ({
  id: 'domain-rule',
  vaultId: 'research',
  type: 'domain',
  pattern: 'example.com',
  priority: 10,
  enabled: true,
  ...overrides
});

function checkParity(args: {
  domain?: string;
  rules?: RoutingRule[];
  vaults?: VaultConfig[];
  requestedVaultId?: string;
  expectedId: string;
}): void {
  const options = {
    ...DEFAULT_OPTIONS,
    vaultRouter: {
      defaultVaultId: 'default',
      vaults: args.vaults ?? [vault('default'), vault('research')],
      rules: args.rules ?? [rule()]
    }
  };
  const payload: ClipPayload = {
    title: 'Research log',
    markdown: 'A note about coding',
    type: 'article',
    meta: { url: `https://${args.domain ?? 'example.com'}/articles/42` }
  };
  const selection = args.requestedVaultId
    ? { kind: 'vault' as const, vaultId: args.requestedVaultId }
    : undefined;
  const preview = buildExportDestinationPreview({
    options,
    payload,
    ...(selection ? { selection } : {})
  });
  expect(preview.id).toBe(args.expectedId);
  const directPayload = selection
    ? { ...payload, meta: { ...payload.meta, exportDestination: selection } }
    : payload;
  expect(selectVaultForClip(options, directPayload).vault?.id).toBe(args.expectedId);

  // The content destination state serializes the preview into the outgoing payload,
  // so an incorrect preview would otherwise become an explicit background override.
  const metadata = createExportDestinationMetadata(parseExportDestinationId(preview.id));
  expect(
    selectVaultForClip(options, {
      ...payload,
      meta: { ...payload.meta, exportDestination: metadata }
    }).vault?.id
  ).toBe(args.expectedId);
}

describe('vault routing preview and background parity', () => {
  it.each([
    ['example.com', 'research'],
    ['www.example.com', 'research'],
    ['notexample.com', 'default'],
    ['example.company', 'default'],
    ['unrelated.test', 'default']
  ])('routes %s to %s before and after preview metadata', (domain, expectedId) => {
    checkParity({ domain, expectedId });
  });

  it.each([
    ['domain', ' NEWS.EXAMPLE.COM ; *.example.org ', 'news.example.com', 'research'],
    ['domain', '*.example.org', 'www.example.org', 'research'],
    ['domain', '*.example.org', 'example.org', 'default'],
    ['keyword', 'missing, Coding', 'unrelated.test', 'research'],
    ['url-pattern', 'articles/\\d+$', 'unrelated.test', 'research'],
    ['url-pattern', '  \t ', 'unrelated.test', 'default'],
    ['url-pattern', '[', 'unrelated.test', 'default']
  ] as const)('shares %s pattern %s semantics', (type, pattern, domain, expectedId) => {
    checkParity({ domain, rules: [rule({ type, pattern })], expectedId });
  });

  it('keeps the highest priority enabled rule and ignores disabled vault targets', () => {
    checkParity({
      vaults: [vault('default'), vault('research'), { ...vault('disabled'), enabled: false }],
      rules: [
        rule({ id: 'disabled-target', vaultId: 'disabled', priority: 100 }),
        rule({ id: 'disabled-rule', vaultId: 'default', priority: 90, enabled: false }),
        rule({ id: 'lower', vaultId: 'default', priority: 1 }),
        rule()
      ],
      expectedId: 'research'
    });
  });

  it('preserves legacy duplicate ID precedence over per-vault rules', () => {
    checkParity({
      vaults: [vault('default'), { ...vault('research'), rules: [rule()] }],
      rules: [rule({ pattern: 'other.test' })],
      expectedId: 'default'
    });
  });

  it('ignores rules declared under disabled vaults', () => {
    checkParity({
      vaults: [
        vault('default'),
        vault('research'),
        { ...vault('disabled'), enabled: false, rules: [rule()] }
      ],
      rules: [],
      expectedId: 'default'
    });
  });

  it('honors explicit enabled vault selection ahead of matching rules', () => {
    checkParity({ requestedVaultId: 'default', expectedId: 'default' });
  });

  it('keeps an explicit Downloads choice when a vault rule matches', () => {
    const preview = buildExportDestinationPreview({
      options: {
        ...DEFAULT_OPTIONS,
        vaultRouter: { vaults: [vault('research')], rules: [rule()] }
      },
      payload: { markdown: 'note', meta: { url: 'https://example.com/' } },
      selection: { kind: 'downloads' }
    });
    expect(preview.id).toBe('downloads');
    expect(createExportDestinationMetadata(parseExportDestinationId(preview.id))).toEqual({
      kind: 'downloads'
    });
  });
});
