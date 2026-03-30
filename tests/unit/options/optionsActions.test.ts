import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('optionsActions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws when actions are used before configuration', async () => {
    const mod = await import('@options/app/optionsActions');
    await expect(mod.copyConfig()).rejects.toThrow('[optionsActions] Actions have not been configured.');
  });

  it('forwards actions and updates language through state manager', async () => {
    const mod = await import('@options/app/optionsActions');
    const setState = vi.fn();
    const changeLanguage = vi.fn(() => Promise.resolve('zh-CN' as const));
    const copyConfig = vi.fn(() => Promise.resolve());
    const importConfig = vi.fn(() => Promise.resolve());
    const saveOptions = vi.fn(() => Promise.resolve());
    const runDiagnostics = vi.fn(() => Promise.resolve());
    const fixConfiguration = vi.fn(() => Promise.resolve());
    const reloadDiagnostics = vi.fn(() => Promise.resolve());

    mod.configureOptionsActions({
      stateManager: { setState } as { setState: typeof setState } as never,
      changeLanguage,
      copyConfig,
      importConfig,
      saveOptions,
      runDiagnostics,
      fixConfiguration,
      reloadDiagnostics
    });

    await mod.changeLanguage('en');
    await mod.copyConfig();
    await mod.importConfig();
    await mod.saveOptions();
    await mod.runDiagnostics();
    await mod.fixConfiguration();
    await mod.reloadDiagnostics();

    expect(changeLanguage).toHaveBeenCalledWith('en');
    expect(setState).toHaveBeenCalledWith({ language: 'zh-CN' });
    expect(copyConfig).toHaveBeenCalledTimes(1);
    expect(importConfig).toHaveBeenCalledTimes(1);
    expect(saveOptions).toHaveBeenCalledTimes(1);
    expect(runDiagnostics).toHaveBeenCalledTimes(1);
    expect(fixConfiguration).toHaveBeenCalledTimes(1);
    expect(reloadDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('does not require a state manager for language changes', async () => {
    const mod = await import('@options/app/optionsActions');
    const changeLanguage = vi.fn(() => Promise.resolve('ja' as const));

    mod.configureOptionsActions({
      stateManager: null,
      changeLanguage,
      copyConfig: () => Promise.resolve(),
      importConfig: () => Promise.resolve(),
      saveOptions: () => Promise.resolve(),
      runDiagnostics: () => Promise.resolve(),
      fixConfiguration: () => Promise.resolve(),
      reloadDiagnostics: () => Promise.resolve()
    });

    await expect(mod.changeLanguage('en')).resolves.toBeUndefined();
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });
});
