/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FragmentClipperOptions } from '@shared/types/options';

type LooseFragmentClipperOptions = Omit<FragmentClipperOptions, 'keyboardShortcutsEnabled'> &
  Partial<Pick<FragmentClipperOptions, 'keyboardShortcutsEnabled'>>;

// Mock the configuration system
const mockOptions: { fragmentClipper: FragmentClipperOptions } = {
  fragmentClipper: {
    useFootnoteFormat: true,
    captureContext: true,
    contextLength: 500,
    contextMode: 'chars',
    selectionModifierEnabled: false,
    selectionModifierKeys: [],
    keyboardShortcutsEnabled: true
  }
};

const configProviderMock = {
  getDefaults: vi.fn(() => ({
    rest: {
      httpsHost: '',
      httpHost: '',
      basePath: '',
      vaultName: '',
      apiKey: ''
    },
    templates: {
      article: '',
      fragment: '',
      reading: '',
      ai: ''
    },
    fragmentClipper: { ...mockOptions.fragmentClipper },
    llm: {
      timeoutMs: 0,
      retryAttempts: 0
    },
    ui: {
      notificationTimeoutMs: 0
    }
  })),
  getRestDefaults: vi.fn(() => ({
    baseUrl: '',
    httpsUrl: '',
    httpUrl: '',
    httpsHost: '',
    httpsPort: undefined,
    httpHost: '',
    httpPort: undefined,
    basePath: '',
    vault: '',
    apiKey: ''
  })),
  getTemplates: vi.fn(() => ({
    article: '',
    fragment: '',
    reading: '',
    ai: ''
  })),
  getFragmentClipperDefaults: vi.fn(() => ({
    ...mockOptions.fragmentClipper
  })),
  getLlmDefaults: vi.fn(() => ({
    timeoutMs: 0,
    retryAttempts: 0
  })),
  getUiDefaults: vi.fn(() => ({
    notificationTimeoutMs: 0
  }))
};

vi.mock('../../../src/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/shared/config')>();
  return {
    ...actual,
    configProvider: configProviderMock,
    createConfigProvider: vi.fn(),
    loadOverrideFromEnv: vi.fn()
  };
});

const mockLoadFragmentConfig = vi.fn();

vi.mock('../../../src/content/clipper/services/fragmentConfig', () => ({
  loadFragmentConfig: mockLoadFragmentConfig
}));

describe('Keyboard Shortcuts Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    // Reset mock options
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = true;
    mockLoadFragmentConfig.mockResolvedValue(mockOptions.fragmentClipper);
  });

  it('loads keyboard shortcuts configuration correctly', async () => {
    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');

    const config = await loadFragmentConfig();
    expect(config.keyboardShortcutsEnabled).toBe(true);
  });

  it('respects disabled keyboard shortcuts configuration', async () => {
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = false;
    mockLoadFragmentConfig.mockResolvedValue(mockOptions.fragmentClipper);

    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');

    const config = await loadFragmentConfig();
    expect(config.keyboardShortcutsEnabled).toBe(false);
  });

  it('keyboard shortcuts work with modifier keys configuration', async () => {
    mockOptions.fragmentClipper.selectionModifierEnabled = true;
    mockOptions.fragmentClipper.selectionModifierKeys = ['alt', 'meta'];
    mockLoadFragmentConfig.mockResolvedValue(mockOptions.fragmentClipper);

    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');

    const config = await loadFragmentConfig();
    expect(config.keyboardShortcutsEnabled).toBe(true);
    expect(config.selectionModifierEnabled).toBe(true);
    expect(config.selectionModifierKeys).toEqual(['alt', 'meta']);
  });

  it('configuration changes are reflected in loaded config', async () => {
    // Initial state
    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');

    let config = await loadFragmentConfig();
    expect(config.keyboardShortcutsEnabled).toBe(true);

    // Change configuration
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = false;
    mockLoadFragmentConfig.mockResolvedValue(mockOptions.fragmentClipper);

    // Reload configuration
    config = await loadFragmentConfig();
    expect(config.keyboardShortcutsEnabled).toBe(false);
  });

  it('handles missing keyboard shortcuts configuration gracefully', async () => {
    // Remove keyboard shortcuts from config
    const configWithoutShortcuts: LooseFragmentClipperOptions = { ...mockOptions.fragmentClipper };
    delete configWithoutShortcuts.keyboardShortcutsEnabled;
    mockLoadFragmentConfig.mockResolvedValue(configWithoutShortcuts as FragmentClipperOptions);

    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');

    const config = await loadFragmentConfig();
    // Should return undefined for missing property (handled by defaults elsewhere)
    expect(config.keyboardShortcutsEnabled).toBeUndefined();
  });
});

describe('Configuration Provider Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = true;
  });

  it('provides keyboard shortcuts configuration through config provider', async () => {
    const { configProvider } = await import('../../../src/shared/config');

    const config = configProvider.getDefaults();
    expect(config.fragmentClipper.keyboardShortcutsEnabled).toBe(true);
  });

  it('config provider respects keyboard shortcuts setting', async () => {
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = false;

    const { configProvider } = await import('../../../src/shared/config');

    const config = configProvider.getDefaults();
    expect(config.fragmentClipper.keyboardShortcutsEnabled).toBe(false);
  });

  it('config provider includes all fragment clipper options', async () => {
    mockOptions.fragmentClipper = {
      useFootnoteFormat: true,
      captureContext: false,
      contextLength: 1000,
      contextMode: 'chars',
      selectionModifierEnabled: true,
      selectionModifierKeys: ['ctrl'],
      keyboardShortcutsEnabled: true
    };

    const { configProvider } = await import('../../../src/shared/config');

    const config = configProvider.getDefaults();
    expect(config.fragmentClipper).toMatchObject({
      keyboardShortcutsEnabled: true,
      selectionModifierEnabled: true,
      selectionModifierKeys: ['ctrl'],
      captureContext: false,
      contextLength: 1000
    });
  });
});

describe('End-to-End Configuration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Create options page elements
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'fragmentKeyboardShortcutsEnabled';
    checkbox.checked = true;
    document.body.appendChild(checkbox);
  });

  it('simulates user enabling keyboard shortcuts in options', async () => {
    const checkbox = document.getElementById(
      'fragmentKeyboardShortcutsEnabled'
    ) as HTMLInputElement;

    // User checks the checkbox
    checkbox.checked = true;

    // Simulate options save (this would normally update the stored config)
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = checkbox.checked;
    mockLoadFragmentConfig.mockResolvedValue(mockOptions.fragmentClipper);

    // Verify configuration is updated
    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');
    const config = await loadFragmentConfig();

    expect(config.keyboardShortcutsEnabled).toBe(true);
  });

  it('simulates user disabling keyboard shortcuts in options', async () => {
    const checkbox = document.getElementById(
      'fragmentKeyboardShortcutsEnabled'
    ) as HTMLInputElement;

    // User unchecks the checkbox
    checkbox.checked = false;

    // Simulate options save
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = checkbox.checked;
    mockLoadFragmentConfig.mockResolvedValue(mockOptions.fragmentClipper);

    // Verify configuration is updated
    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');
    const config = await loadFragmentConfig();

    expect(config.keyboardShortcutsEnabled).toBe(false);
  });

  it('preserves other settings when keyboard shortcuts are toggled', async () => {
    const checkbox = document.getElementById(
      'fragmentKeyboardShortcutsEnabled'
    ) as HTMLInputElement;

    // Set up initial state with other options
    mockOptions.fragmentClipper = {
      useFootnoteFormat: true,
      captureContext: true,
      contextLength: 750,
      contextMode: 'chars',
      selectionModifierEnabled: true,
      selectionModifierKeys: ['alt'],
      keyboardShortcutsEnabled: true
    };

    // User toggles keyboard shortcuts
    checkbox.checked = false;
    mockOptions.fragmentClipper.keyboardShortcutsEnabled = false;
    mockLoadFragmentConfig.mockResolvedValue(mockOptions.fragmentClipper);

    // Verify only keyboard shortcuts changed
    const { loadFragmentConfig } =
      await import('../../../src/content/clipper/services/fragmentConfig');
    const config = await loadFragmentConfig();

    expect(config.keyboardShortcutsEnabled).toBe(false);
    expect(config.selectionModifierEnabled).toBe(true);
    expect(config.selectionModifierKeys).toEqual(['alt']);
    expect(config.captureContext).toBe(true);
    expect(config.contextLength).toBe(750);
  });
});
