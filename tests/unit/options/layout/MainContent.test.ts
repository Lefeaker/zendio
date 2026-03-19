/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { MainContent } from '@options/components/layout/MainContent';
import { createOptionsStateManager } from '@options/state/StateManager';
import type { OptionsStateManager } from '@options/state/StateManager';
import { ensureSvgElementConstructors } from '../../../utils/svgElementPolyfill';

ensureSvgElementConstructors();

describe('MainContent lifecycle management', () => {
  let container: HTMLElement;
  let mainContent: MainContent;
  let stateManager: OptionsStateManager;
  let registry: FormSectionRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    mainContent = new MainContent(container);
    stateManager = createOptionsStateManager();
    registry = new FormSectionRegistry();
    mainContent.render({
      stateManager,
      formRegistry: registry
    });
  });

  afterEach(() => {
    mainContent.destroy();
    registry.clear();
    container.remove();
  });

  it('allows sections to be unmounted and remounted', async () => {
    const firstInstance = await mainContent.mountSection('usage');
    expect(firstInstance).not.toBeNull();
    expect(stateManager.getState().mountedSections).toHaveProperty('usage', true);
    expect(stateManager.getState().activeSection).toBe('usage');

    mainContent.unmountSection('usage');
    expect(mainContent.isSectionMounted('usage')).toBe(false);
    expect(stateManager.getState().mountedSections).not.toHaveProperty('usage');
    expect(stateManager.getState().activeSection).toBeNull();

    const secondInstance = await mainContent.mountSection('usage');
    expect(secondInstance).not.toBeNull();
    expect(secondInstance).not.toBe(firstInstance);
    expect(mainContent.isSectionMounted('usage')).toBe(true);
    expect(stateManager.getState().mountedSections).toHaveProperty('usage', true);
  });

  it('safely ignores unknown section identifiers', async () => {
    expect(mainContent.getSectionInstance('unknown-section')).toBeNull();
    mainContent.unmountSection('unknown-section');
    const mounted = await mainContent.mountSection('unknown-section');
    expect(mounted).toBeNull();
  });

  it('mounts sections on demand and tracks active section changes', async () => {
    expect(mainContent.isSectionMounted('privacy')).toBe(false);
    expect(stateManager.getState().mountedSections).not.toHaveProperty('privacy');

    await mainContent.navigateTo('privacy');
    expect(mainContent.isSectionMounted('privacy')).toBe(true);
    expect(stateManager.getState().activeSection).toBe('privacy');
  });

  it('preloads section constructors to avoid repeated dynamic imports', async () => {
    const records = (mainContent as unknown as { sectionDefinitions: Array<{ id: string; load: () => Promise<unknown> }> })
      .sectionDefinitions;
    const usageDefinition = records.find(def => def.id === 'usage');
    expect(usageDefinition).toBeDefined();
    if (!usageDefinition) {
      throw new Error('usage definition missing');
    }

    const originalLoad = usageDefinition.load;
    const loadSpy = vi.fn(async () => originalLoad());
    usageDefinition.load = loadSpy;

    await mainContent.preloadSections(['usage']);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    await mainContent.mountSection('usage');
    expect(loadSpy).toHaveBeenCalledTimes(1);

    usageDefinition.load = originalLoad;
  });
});
