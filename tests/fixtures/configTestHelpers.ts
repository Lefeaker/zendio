import { configProvider } from '../../src/shared/config';
import type { VaultConfig, VaultRouterConfig } from '../../src/shared/types';

/**
 * Create test vault configuration using default ports from configProvider
 */
export function createTestVaultConfig(overrides: Partial<VaultConfig> = {}): VaultConfig {
  const restDefaults = configProvider.getRestDefaults();
  
  return {
    id: 'test-vault',
    name: 'Test Vault',
    httpsUrl: `https://test.local:${restDefaults.httpsPort}/`,
    httpUrl: `http://test.local:${restDefaults.httpPort}/`,
    vault: 'TestVault',
    apiKey: 'test-key',
    isDefault: false,
    rules: [],
    ...overrides
  };
}

/**
 * Create test vault router configuration with default and additional vaults
 */
export function createTestVaultRouterConfig(additionalVaults: VaultConfig[] = []): VaultRouterConfig {
  const restDefaults = configProvider.getRestDefaults();

  const defaultVault: VaultConfig = {
    id: 'default',
    name: 'Default Vault',
    httpsUrl: `https://default.local:${restDefaults.httpsPort}/`,
    httpUrl: `http://default.local:${restDefaults.httpPort}/`,
    vault: 'Default',
    apiKey: 'default-key',
    isDefault: true,
    rules: []
  };

  return {
    vaults: [defaultVault, ...additionalVaults],
    defaultVaultId: 'default'
  };
}

/**
 * Create test vault configurations for specific AI platforms
 */
export function createAiPlatformTestVaults() {
  const restDefaults = configProvider.getRestDefaults();
  
  const platforms = [
    { id: 'kimi-ai', name: 'Kimi Vault', vault: 'KimiAI', host: 'kimi.local' },
    { id: 'monica-ai', name: 'Monica Vault', vault: 'MonicaAI', host: 'monica.local' },
    { id: 'doubao-ai', name: 'Doubao Vault', vault: 'DoubaoAI', host: 'doubao.local' },
    { id: 'deepseek-ai', name: 'DeepSeek Vault', vault: 'DeepSeekAI', host: 'deepseek.local' },
    { id: 'claude-ai', name: 'Claude Vault', vault: 'ClaudeAI', host: 'claude.local' },
    { id: 'tongyi-ai', name: 'Tongyi Vault', vault: 'TongyiAI', host: 'tongyi.local' }
  ];

  return platforms.map(platform => ({
    id: platform.id,
    name: platform.name,
    httpsUrl: `https://${platform.host}:${restDefaults.httpsPort}/`,
    httpUrl: `http://${platform.host}:${restDefaults.httpPort}/`,
    vault: platform.vault,
    apiKey: `${platform.id}-key`,
    isDefault: false,
    rules: []
  }));
}

/**
 * Get test REST URLs using configuration defaults
 */
export function getTestRestUrls(host = 'test.local') {
  const restDefaults = configProvider.getRestDefaults();
  return {
    httpsUrl: `https://${host}:${restDefaults.httpsPort}/`,
    httpUrl: `http://${host}:${restDefaults.httpPort}/`,
    baseUrl: `https://${host}:${restDefaults.httpsPort}/`
  };
}
