/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YamlConfigControllerOptions } from '../../../src/ui/domains/yaml-config/yamlConfigTable';
import { YamlConfigView } from '../../../src/ui/domains/yaml-config';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

const createMockFn = <T extends (...args: any[]) => any>() =>
  vi.fn<Parameters<T>, ReturnType<T>>();

type ControllerStub = {
  render: ReturnType<typeof createMockFn<(value: YamlConfigOverrides | null) => void>>;
  collect: ReturnType<typeof createMockFn<() => YamlConfigOverrides | null>>;
  dispose: ReturnType<typeof createMockFn<() => void>>;
};

const controllerStubs: ControllerStub[] = [];
let lastControllerOptions: YamlConfigControllerOptions | undefined;

vi.mock('../../../src/ui/domains/yaml-config/yamlConfigTable', () => ({
  createYamlConfigController: vi.fn((options: YamlConfigControllerOptions) => {
    lastControllerOptions = options;
    const stub: ControllerStub = {
      render: createMockFn<(value: YamlConfigOverrides | null) => void>(),
      collect: createMockFn<() => YamlConfigOverrides | null>().mockReturnValue(null),
      dispose: createMockFn<() => void>()
    };
    controllerStubs.push(stub);
    return stub;
  })
}));

describe('YamlConfigView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllerStubs.length = 0;
    lastControllerOptions = undefined;
    document.body.innerHTML = '<section id="host"></section>';
  });

  it('mounts layout once and forwards render/update/collect to controller', async () => {
    const host = document.getElementById('host');
    if (!(host instanceof HTMLElement)) throw new Error('host missing');

    const view = new YamlConfigView(host);
    view.setMessages({
      yamlFieldNameLabel: 'Field',
      yamlFieldTypeLabel: 'Type',
      yamlFieldArticleLabel: 'Article',
      yamlFieldClipperLabel: 'Clipper',
      yamlFieldVideoLabel: 'Video',
      yamlFieldAiLabel: 'AI',
      yamlFieldDefaultValueLabel: 'Value',
      yamlFieldActionsLabel: 'Actions',
      yamlFieldDeleteButton: 'Delete',
      yamlFieldCustomNamePlaceholder: 'Field name',
      yamlFieldDefaultPlaceholder: 'Field value',
      yamlFieldAdvancedShowLabel: 'Show source',
      yamlFieldAdvancedHideLabel: 'Hide source',
      yamlFieldValuePathLabel: 'Value path',
      yamlFieldValuePathPlaceholder: 'meta.author',
      yamlFieldValuePathHint: 'hint',
      yamlDefaultGroupLabel: 'Default fields',
      yamlFilterAllLabel: 'All',
      yamlCustomGroupLabel: 'Custom fields',
      yamlFieldErrorNameRequired: 'Field name is required',
      yamlFieldErrorNamePattern: 'Bad name',
      yamlFieldErrorNameDuplicate: 'Duplicate',
      yamlFieldErrorModeRequired: 'Mode required',
      yamlFieldErrorTypeRequired: 'Type required',
      yamlFieldErrorValueInvalid: 'Invalid value',
      yamlFieldErrorValuePathInvalid: 'Invalid path',
      yamlFieldSaveBlockedWarning: 'Fix errors'
    } as never);

    const overrides: YamlConfigOverrides = {
      contentTypes: { article: { fields: [{ name: 'title', type: 'text', enabled: true }] } }
    };
    const onDirty = vi.fn();
    view.render({ overrides, onDirty });
    await vi.waitFor(() => {
      expect(controllerStubs).toHaveLength(1);
    });
    view.render({ overrides: null, onDirty });

    expect(lastControllerOptions?.onDirty).toBe(onDirty);
    expect(host.querySelector('#yamlConfigTable')).toBeTruthy();
    expect(controllerStubs[0].render).toHaveBeenNthCalledWith(1, overrides);
    expect(controllerStubs[0].render).toHaveBeenNthCalledWith(2, null);

    const collected = {
      contentTypes: { video: { fields: [{ name: 'duration', type: 'number', enabled: true }] } }
    } as YamlConfigOverrides;
    controllerStubs[0].collect.mockReturnValue(collected);
    expect(view.collect()).toEqual(collected);

    view.update(null);
    expect(controllerStubs[0].render).toHaveBeenLastCalledWith(null);
  });

  it('disposes the controller and rejects further use after destroy', async () => {
    const host = document.getElementById('host');
    if (!(host instanceof HTMLElement)) throw new Error('host missing');
    const view = new YamlConfigView(host);
    view.render({ overrides: null, onDirty: vi.fn() });
    await vi.waitFor(() => {
      expect(controllerStubs).toHaveLength(1);
    });
    const controller = controllerStubs[0];
    view.destroy();
    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(host.childElementCount).toBe(0);
    expect(() => view.collect()).toThrow('[BaseComponent] Component has already been destroyed.');
  });
});
