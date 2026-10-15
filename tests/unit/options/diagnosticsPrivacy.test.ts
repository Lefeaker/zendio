/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { getMessagesForLanguage } from '@i18n';
import { buildDiagnosticsReport } from '@options/components/diagnostics';
import { buildDiagnosticsModel } from '@options/components/diagnostics/diagnosticsModel';
import { serializeOptionsFullBackup } from '@options/app/productionStitchConfigExport';
import { decodeStoredOptions } from '@shared/config/storedOptionsCodec';
import { createCompleteOptions } from './productionStitchShell.helpers';
import {
  createDiagnosticsPrivacyOptions,
  DIAGNOSTICS_PRIVATE_VALUES
} from '../../utils/diagnosticsPrivacyFixture';

describe('diagnostics privacy boundary', () => {
  it('omits credentials and arbitrary private text while retaining useful checks', async () => {
    const options = createDiagnosticsPrivacyOptions();
    const before = structuredClone(options);
    const report = buildDiagnosticsReport(options, await getMessagesForLanguage('en'));
    const model = JSON.stringify(buildDiagnosticsModel(options));
    for (const value of DIAGNOSTICS_PRIVATE_VALUES) {
      expect(report).not.toContain(value);
      expect(model).not.toContain(value);
    }
    expect(report).toContain('Configured vaults: 2');
    expect(report).toContain('Routing rules: 1');
    expect(report).toContain('Domain Mapping Configuration: 1');
    expect(report).toContain('Video Path Template is not configured');
    expect(report).toContain('27124');
    expect(report).toContain('Context length: 120');
    expect(report).toContain('Highlight color: purple');
    expect(options).toEqual(before);
  });

  it('does not echo unknown roots, keys, or invalid enum values', async () => {
    const options = createDiagnosticsPrivacyOptions();
    Reflect.set(options, 'PRIVATE_UNKNOWN_ROOT', { PRIVATE_UNKNOWN_KEY: 'PRIVATE_UNKNOWN_VALUE' });
    Reflect.set(options, 'readingSession', {
      exportMode: 'PRIVATE_EXPORT_MODE',
      highlightTheme: 'PRIVATE_THEME'
    });
    const before = structuredClone(options);
    const report = buildDiagnosticsReport(options, await getMessagesForLanguage('en'));
    expect(report).toContain('Unknown export mode');
    expect(report).toContain('Unknown highlight theme');
    expect(report).not.toContain('PRIVATE_');
    expect(JSON.stringify(buildDiagnosticsModel(options))).not.toContain('PRIVATE_');
    expect(options).toEqual(before);
  });

  it('keeps explicit full backup and import round trips complete after diagnosis', () => {
    const options = createCompleteOptions(createDiagnosticsPrivacyOptions());
    const before = serializeOptionsFullBackup(options);
    buildDiagnosticsReport(options);
    expect(serializeOptionsFullBackup(options)).toBe(before);
    const restored = decodeStoredOptions(JSON.parse(before)).canonical;
    for (const value of DIAGNOSTICS_PRIVATE_VALUES) {
      expect(JSON.stringify(restored)).toContain(value);
    }
    expect(serializeOptionsFullBackup(createCompleteOptions(restored))).toBe(before);
  });
});
