import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumePendingAutoSaveSource,
  getOptionsController,
  markPendingAutoSave,
  registerOptionsController,
  resetOptionsController
} from '@options/app/optionsControllerContext';

describe('optionsControllerContext', () => {
  beforeEach(() => {
    resetOptionsController();
    consumePendingAutoSaveSource();
  });

  it('stores and resets the current controller instance', () => {
    const controller = { dispose() {} } as never;
    registerOptionsController(controller);
    expect(getOptionsController()).toBe(controller);

    resetOptionsController();
    expect(getOptionsController()).toBeNull();
  });

  it('consumes pending auto save source only once', () => {
    markPendingAutoSave('yamlConfig');
    expect(consumePendingAutoSaveSource()).toBe('yamlConfig');
    expect(consumePendingAutoSaveSource()).toBeNull();
  });
});
