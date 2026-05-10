import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { selectVaultForClip } from '../../src/background/services/vaultRouterService';
import { resolvePath } from '../../src/background/pathResolver';
import {
  notifyClipSuccess,
  setNotificationAdapter
} from '../../src/background/services/notifications';
import type { ClipPayload } from '../../src/shared/types';
import type { ClassificationResult } from '../../src/background/services/classificationService';
import { createTestVaultRouterConfig, createTestVaultConfig } from '../fixtures/configTestHelpers';
import {
  captureGlobalSnapshot,
  restoreGlobalSnapshot,
  assignGlobalValues
} from '../utils/globalTestHelpers';
import {
  createChromeMock,
  type ChromeChangeListener,
  type ChromeStorageGet,
  type ChromeStorageSet
} from '../utils/chromeMocks';

describe('clipper end-to-end simulation', () => {
  let globalSnapshot: ReturnType<typeof captureGlobalSnapshot>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-06T07:08:09Z'));
    globalSnapshot = captureGlobalSnapshot();

    const storageGetMock: ChromeStorageGet = vi.fn((_keys, callback) => {
      callback({ language: 'zh-CN' });
    });
    const storageSetMock: ChromeStorageSet = vi.fn((_items, callback) => {
      callback?.();
    });
    const addListenerMock: (listener: ChromeChangeListener) => void = vi.fn();
    const removeListenerMock: (listener: ChromeChangeListener) => void = vi.fn();

    const chromeMock = createChromeMock({
      get: storageGetMock,
      set: storageSetMock,
      addListener: addListenerMock,
      removeListener: removeListenerMock
    });
    assignGlobalValues({ chrome: chromeMock });
  });

  afterEach(() => {
    vi.useRealTimers();
    setNotificationAdapter(null);
    restoreGlobalSnapshot(globalSnapshot);
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

    const techVault = createTestVaultConfig({
      id: 'tech',
      name: 'Tech Vault',
      httpsUrl: 'https://tech.local:27124/',
      httpUrl: 'http://tech.local:27123/',
      vault: 'Tech',
      apiKey: 'tech-key',
      rules: [
        {
          id: 'rule-domain',
          vaultId: 'tech',
          type: 'domain',
          pattern: '*.example.com',
          enabled: true,
          priority: 50
        }
      ]
    });

    const vaultRouterConfig = createTestVaultRouterConfig([techVault]);

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
      topics: [],
      tags: [],
      status: 'success'
    };
    const filePath = resolvePath(
      options.templates,
      clipPayload,
      classification,
      options.domainMappings
    );
    expect(filePath).toBe('Articles/TechExample/2024/shared-clip.md');

    const notificationSpy = vi.fn();
    setNotificationAdapter(notificationSpy);
    await notifyClipSuccess(filePath, selection.vault?.name);
    expect(notificationSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^clipper-success-/),
      expect.objectContaining({
        channel: 'clipper.success',
        severity: 'success',
        message: 'Saved via Obsidian REST API to: Tech Vault',
        metadata: {
          filePath,
          storageTarget: 'rest-api',
          vaultName: 'Tech Vault'
        }
      })
    );
  });
});
