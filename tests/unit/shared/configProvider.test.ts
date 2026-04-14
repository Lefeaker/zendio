import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CLIPPER_DEFAULTS } from '@shared/config/appConfig';
import { createConfigProvider, loadOverrideFromEnv } from '@shared/config/provider';
import type { ConfigOverrides } from '@shared/config/provider';

type ProcessAwareGlobal = typeof globalThis & { process?: typeof process };
const getProcessAwareGlobal = (): ProcessAwareGlobal => globalThis as ProcessAwareGlobal;

describe('configProvider', () => {
  beforeEach(() => {
    // Clear environment variables
    vi.unstubAllEnvs();
  });

  describe('createConfigProvider', () => {
    it('returns default configuration when no overrides provided', () => {
      const provider = createConfigProvider({
        defaults: CLIPPER_DEFAULTS
      });

      const restDefaults = provider.getRestDefaults();
      expect(restDefaults.httpsHost).toBe('127.0.0.1');
      expect(restDefaults.httpsPort).toBe(27124);
      expect(restDefaults.httpHost).toBe('127.0.0.1');
      expect(restDefaults.httpPort).toBe(27123);
      expect(restDefaults.vault).toBe('AllInObsidian');
    });

    it('applies overrides correctly', () => {
      const overrides: ConfigOverrides = {
        rest: {
          httpsHost: 'custom.local',
          httpsPort: 8443,
          vaultName: 'CustomVault'
        }
      };

      const provider = createConfigProvider({
        defaults: CLIPPER_DEFAULTS,
        overrides
      });

      const restDefaults = provider.getRestDefaults();
      expect(restDefaults.httpsHost).toBe('custom.local');
      expect(restDefaults.httpsPort).toBe(8443);
      expect(restDefaults.httpHost).toBe('127.0.0.1'); // Should keep default
      expect(restDefaults.vault).toBe('CustomVault');
    });

    it('generates correct URLs from host and port', () => {
      const overrides: ConfigOverrides = {
        rest: {
          httpsHost: 'test.local',
          httpsPort: 9443,
          httpHost: 'test.local',
          httpPort: 9080
        }
      };

      const provider = createConfigProvider({
        defaults: CLIPPER_DEFAULTS,
        overrides
      });

      const restDefaults = provider.getRestDefaults();
      expect(restDefaults.httpsUrl).toBe('https://test.local:9443/');
      expect(restDefaults.httpUrl).toBe('http://test.local:9080/');
      expect(restDefaults.baseUrl).toBe('https://test.local:9443/');
    });

    it('returns immutable configuration objects', () => {
      const provider = createConfigProvider({
        defaults: CLIPPER_DEFAULTS
      });

      const config1 = provider.getRestDefaults();
      const config2 = provider.getRestDefaults();

      // Should return different objects (not the same reference)
      expect(config1).not.toBe(config2);
      // But with the same values
      expect(config1).toEqual(config2);
    });
  });

  describe('loadOverrideFromEnv', () => {
    it('returns undefined when no environment variables are set', () => {
      const overrides = loadOverrideFromEnv();
      expect(overrides).toBeUndefined();
    });

    it('loads REST configuration from environment variables', () => {
      vi.stubEnv('AIIINOB_REST_HTTPS_HOST', 'env.local');
      vi.stubEnv('AIIINOB_REST_HTTPS_PORT', '8443');
      vi.stubEnv('AIIINOB_REST_HTTP_PORT', '8080');
      vi.stubEnv('AIIINOB_REST_VAULT_NAME', 'EnvVault');

      const overrides = loadOverrideFromEnv();
      
      expect(overrides).toBeDefined();
      expect(overrides?.rest?.httpsHost).toBe('env.local');
      expect(overrides?.rest?.httpsPort).toBe(8443);
      expect(overrides?.rest?.httpPort).toBe(8080);
      expect(overrides?.rest?.vaultName).toBe('EnvVault');
    });

    it('handles invalid port numbers gracefully', () => {
      vi.stubEnv('AIIINOB_REST_HTTPS_PORT', 'invalid');
      vi.stubEnv('AIIINOB_REST_HTTP_PORT', 'NaN');

      const overrides = loadOverrideFromEnv();
      
      // Should not include invalid ports
      expect(overrides?.rest?.httpsPort).toBeUndefined();
      expect(overrides?.rest?.httpPort).toBeUndefined();
    });

    it('returns undefined when globalThis.process is not available', () => {
      const runtime = getProcessAwareGlobal();
      const originalProcess = runtime.process;
      Reflect.deleteProperty(runtime, 'process');

      const overrides = loadOverrideFromEnv();
      expect(overrides).toBeUndefined();

      // Restore process
      runtime.process = originalProcess;
    });
  });

  describe('template defaults', () => {
    it('returns correct template defaults', () => {
      const provider = createConfigProvider({
        defaults: CLIPPER_DEFAULTS
      });

      const templates = provider.getTemplates();
      expect(templates.article).toBe('Articles/{domain}/{yyyy}/{slug}.md');
      expect(templates.fragment).toBe('Fragments/{yyyy}/{mm}/{dd}/{title}.md');
      expect(templates.reading).toBe('Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md');
      expect(templates.ai).toBe('AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md');
    });
  });

  describe('fragment clipper defaults', () => {
    it('returns correct fragment clipper defaults', () => {
      const provider = createConfigProvider({
        defaults: CLIPPER_DEFAULTS
      });

      const fragmentDefaults = provider.getFragmentClipperDefaults();
      expect(fragmentDefaults.useFootnoteFormat).toBe(true);
      expect(fragmentDefaults.captureContext).toBe(false);
      expect(fragmentDefaults.contextLength).toBe(200);
      expect(fragmentDefaults.contextMode).toBe('chars');
      expect(fragmentDefaults.selectionModifierEnabled).toBe(false);
      expect(Array.isArray(fragmentDefaults.selectionModifierKeys)).toBe(true);
    });
  });

  describe('LLM defaults', () => {
    it('returns correct LLM defaults', () => {
      const provider = createConfigProvider({
        defaults: CLIPPER_DEFAULTS
      });

      const llmDefaults = provider.getLlmDefaults();
      expect(llmDefaults.timeoutMs).toBe(15_000);
      expect(llmDefaults.retryAttempts).toBe(3);
    });
  });
});
