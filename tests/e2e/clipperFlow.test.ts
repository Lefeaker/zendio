import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { selectVaultForClip, buildClipContext } from '../../src/background/services/vaultRouterService';
import { resolvePath } from '../../src/background/pathResolver';
import { notifyClipSuccess, setNotificationAdapter } from '../../src/background/services/notifications';
import type { ClipPayload, VaultRouterConfig } from '../../src/shared/types';
import type { ClassificationResult } from '../../src/background/services/classificationService';

describe('clipper end-to-end simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-06T07:08:09Z'));

    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({ language: 'zh-CN' }),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    setNotificationAdapter(null);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as any).chrome;
  });

  it('routes clip, resolves path and emits success notification', async () => {
    const clipPayload: ClipPayload = {
      markdown: '# Hello',
      title: 'Shared Clip',
      type: 'article',
      meta: {
        url: 'https://tech.example.com/post',
        domain: 'tech.example.com',
        platform: 'chatgpt'
      }
    };

    const vaultRouterConfig: VaultRouterConfig = {
      vaults: [
        {
          id: 'default',
          name: 'Default Vault',
          httpsUrl: 'https://default.local:27124/',
          httpUrl: 'http://default.local:27123/',
          vault: 'Default',
          apiKey: 'default-key',
          isDefault: true
        },
        {
          id: 'tech',
          name: 'Tech Vault',
          httpsUrl: 'https://tech.local:27124/',
          httpUrl: 'http://tech.local:27123/',
          vault: 'Tech',
          apiKey: 'tech-key'
        }
      ],
      rules: [
        {
          id: 'rule-domain',
          vaultId: 'tech',
          type: 'domain',
          pattern: '*.example.com',
          enabled: true,
          priority: 50
        }
      ],
      defaultVaultId: 'default'
    };

    const merged = mergeOptions({
      domainMappings: { 'tech.example.com': 'TechExample' },
      vaultRouter: vaultRouterConfig
    });

    const options = {
      ...merged,
      vaultRouter: vaultRouterConfig
    };

    const selection = selectVaultForClip(options, clipPayload);
    expect(selection.vault?.id).toBe('tech');
    expect(selection.restConfig.baseUrl).toBe('https://tech.local:27124/');

    const classification: ClassificationResult = {
      type: 'article',
      ai_platform: 'chatgpt',
      topics: []
    };
    const filePath = resolvePath(options.templates, clipPayload, classification, options.domainMappings);
    expect(filePath).toBe('Articles/TechExample/2024/shared-clip.md');

    const notificationSpy = vi.fn();
    setNotificationAdapter(notificationSpy);
    await notifyClipSuccess(filePath, selection.vault?.name);
    expect(notificationSpy).toHaveBeenCalledWith(expect.stringMatching(/^clip-success-/), expect.objectContaining({
      message: filePath
    }));
  });
});
