import { describe, it, expect } from 'vitest';
import { selectVaultForClip, buildClipContext } from '../../../src/background/services/vaultRouterService';
import type { Options } from '../../../src/background/store';
import type { ClipPayload, VaultRouterConfig } from '@shared/types';
import { getRestDefaults } from '../../utils/restDefaults';

function createBaseOptions(): Options {
  const restDefaults = getRestDefaults();
  return {
    rest: {
      baseUrl: restDefaults.baseUrl,
      httpsUrl: restDefaults.httpsUrl,
      httpUrl: restDefaults.httpUrl,
      vault: restDefaults.vault,
      apiKey: 'default-key',
      rootDir: 'root'
    },
    templates: {
      article: '',
      ai: '',
      fragment: '',
      reading: ''
    },
    domainMappings: {},
    classifier: undefined,
    deepResearch: undefined,
    vaultRouter: undefined,
    fragmentClipper: undefined
  };
}

describe('vaultRouterService', () => {
  it('falls back to default rest config when no router is configured', () => {
    const options = createBaseOptions();
    const payload: ClipPayload = { markdown: '# Hello', title: 'Hello', meta: { domain: 'example.com' } };

    const result = selectVaultForClip(options, payload);

    expect(result.vault).toBeNull();
    expect(result.restConfig).toBe(options.rest);
    expect(result.context.domain).toBe('example.com');
  });

  it('selects configured vault when router rule matches domain', () => {
    const options = createBaseOptions();

    const routerConfig: VaultRouterConfig = {
      vaults: [
        {
          id: 'vault-1',
          name: 'Articles Vault',
          httpsUrl: `https://vault.example.com:${getRestDefaults().httpsPort}/`,
          httpUrl: `http://vault.example.com:${getRestDefaults().httpPort}/`,
          vault: 'Articles',
          apiKey: 'vault-key',
          isDefault: false,
          rules: [
            {
              id: 'rule-1',
              vaultId: 'vault-1',
              type: 'domain',
              pattern: 'example.com',
              enabled: true,
              priority: 10,
              description: 'Route example.com'
            }
          ]
        }
      ],
      defaultVaultId: 'vault-1'
    };

    options.vaultRouter = routerConfig;

    const payload: ClipPayload = {
      markdown: '# Routed',
      title: 'Example',
      meta: { domain: 'example.com', url: 'https://example.com/post' }
    };

    const result = selectVaultForClip(options, payload);

    expect(result.vault?.id).toBe('vault-1');
    expect(result.restConfig.baseUrl).toBe(`https://vault.example.com:${getRestDefaults().httpsPort}/`);
    expect(result.restConfig.vault).toBe('Articles');
    expect(result.restConfig.apiKey).toBe('vault-key');
    expect(result.restConfig.rootDir).toBe('root');
  });

  it('builds clip context with derived fields', () => {
    const payload: ClipPayload = {
      markdown: '# Title\nBody',
      title: 'Title',
      meta: { url: 'https://sub.example.com/path' }
    };

    const context = buildClipContext(payload);

    expect(context.domain).toBe('sub.example.com');
    expect(context.title).toBe('Title');
    expect(context.content.length).toBeGreaterThan(0);
    expect(context.type).toBe('article');
  });

  it('falls back to default rest config when router rule does not match', () => {
    const options = createBaseOptions();

    const routerConfig: VaultRouterConfig = {
      vaults: [
        {
          id: 'vault-1',
          name: 'Articles Vault',
          httpsUrl: `https://vault.example.com:${getRestDefaults().httpsPort}/`,
          httpUrl: `http://vault.example.com:${getRestDefaults().httpPort}/`,
          vault: 'Articles',
          apiKey: 'vault-key',
          isDefault: false,
          rules: [
            {
              id: 'rule-1',
              vaultId: 'vault-1',
              type: 'domain',
              pattern: 'news.example.com',
              enabled: true,
              priority: 10
            }
          ]
        }
      ],
      defaultVaultId: 'vault-1'
    };

    options.vaultRouter = routerConfig;

    const payload: ClipPayload = {
      markdown: '# Routed',
      title: 'Example',
      meta: { domain: 'example.com', url: 'https://example.com/post' }
    };

    const result = selectVaultForClip(options, payload);

    expect(result.vault).toBeNull();
    expect(result.restConfig).toBe(options.rest);
  });
});
