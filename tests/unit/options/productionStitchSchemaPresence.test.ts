/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { RELEASE_LANGUAGE_CONFIG, RELEASE_LANGUAGE_ORDER } from '@i18n/catalog/languages';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { createSchemaContext, expectSettingsSchemas } from '../../utils/productionStitchAssertions';
import { getLanguageSelectValues } from '../../utils/optionsI18nTextAssertions';
import { getSettingsView } from '@options/stitch/schema/registry';
import {
  asOptionsController,
  createController,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const EXPECTED_LANGUAGE_VALUES = [...RELEASE_LANGUAGE_ORDER];
const EXPECTED_LANGUAGE_LABELS = EXPECTED_LANGUAGE_VALUES.map(
  (code) => RELEASE_LANGUAGE_CONFIG[code].nativeName
);

function findLanguageSelect(): HTMLSelectElement {
  const select = Array.from(document.querySelectorAll<HTMLSelectElement>('select')).find(
    (candidate) => {
      const values = Array.from(candidate.options).map((option) => option.value);
      return (
        values.length === EXPECTED_LANGUAGE_VALUES.length &&
        values.every((value, index) => value === EXPECTED_LANGUAGE_VALUES[index])
      );
    }
  );

  if (!select) {
    throw new Error('Missing production language select');
  }

  return select;
}

describe('production Stitch schema presence', () => {
  beforeEach(setupProductionStitchShellTest);

  it('keeps language options represented by production Stitch content and schemas', () => {
    expectSettingsSchemas(
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    );
    expect(getSettingsView('overview', createSchemaContext())).toBeTruthy();

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: DEFAULT_RUNTIME_MESSAGES,
      language: 'en'
    });

    expect(getLanguageSelectValues(document)).toEqual(EXPECTED_LANGUAGE_VALUES);
    expect(getLanguageSelectValues(document)).not.toContain('es');
    expect(getLanguageSelectValues(document)).not.toContain('qps-ploc');
    expect(
      Array.from(findLanguageSelect().options).map((option) => option.textContent?.trim())
    ).toEqual(EXPECTED_LANGUAGE_LABELS);
  });

  it('keeps production navigation represented by production Stitch content and schemas', () => {
    expectSettingsSchemas(
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    );
    expect(getSettingsView('overview', createSchemaContext())).toBeTruthy();

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages: DEFAULT_RUNTIME_MESSAGES,
      language: 'en'
    });

    expect(
      Array.from(document.querySelectorAll<HTMLElement>('[data-nav-panel]')).map(
        (button) => button.dataset.navPanel
      )
    ).toEqual([
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    ]);
  });

  it('omits the analytics debug mode row when the runtime capability is disabled', () => {
    const debugContext = createSchemaContext();
    debugContext.capabilities = { analyticsDebugMode: true };
    const debugView = getSettingsView('overview', debugContext);

    expect(JSON.stringify(debugView)).toContain('privacyDebugMode');
    expect(JSON.stringify(debugView)).toContain('Debug mode');

    const productionContext = createSchemaContext();
    productionContext.capabilities = { analyticsDebugMode: false };
    const productionView = getSettingsView('overview', productionContext);

    expect(JSON.stringify(productionView)).not.toContain('privacyDebugMode');
    expect(JSON.stringify(productionView)).not.toContain('Debug mode');
  });
});
