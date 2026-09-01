import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../src/shared/config/defaultOptions';
import {
  composeDeviceLocalPrivacy,
  createDeviceLocalPrivacyTransaction,
  omitDeviceLocalPrivacy,
  readDeviceLocalPrivacyTransaction,
  resolveDeviceLocalPrivacy
} from '../../../src/shared/config/deviceLocalPrivacy';

describe('device-local privacy contract', () => {
  it('keeps a complete fail-closed privacy default for local composition', () => {
    expect(DEFAULT_OPTIONS.privacyPreferences).toEqual({
      analytics: false,
      errorReporting: false,
      debugMode: false
    });
  });

  it('prefers local consent and preserves portable opaque roots while scrubbing privacy', () => {
    const portable = {
      privacyPreferences: { analytics: false, errorReporting: true, debugMode: false },
      opaqueRoot: { keep: true }
    };
    const resolved = resolveDeviceLocalPrivacy(
      { analytics: true, errorReporting: false, timestamp: 1, version: '1.0' },
      { debugMode: true },
      portable
    );

    expect(resolved).toEqual({
      preferences: { analytics: true, errorReporting: false, debugMode: true },
      requiresLocalWrite: false
    });
    expect(omitDeviceLocalPrivacy(portable)).toEqual({ opaqueRoot: { keep: true } });
    expect(composeDeviceLocalPrivacy(DEFAULT_OPTIONS, resolved.preferences).privacyPreferences).toEqual(
      resolved.preferences
    );
  });

  it('migrates a legacy synchronized mirror only when local consent is missing', () => {
    expect(
      resolveDeviceLocalPrivacy(undefined, undefined, {
        privacyPreferences: { analytics: true, errorReporting: true, debugMode: true }
      })
    ).toEqual({
      preferences: { analytics: true, errorReporting: true, debugMode: true },
      requiresLocalWrite: true
    });
  });

  it('preserves exact previous local values in a pending privacy transaction', () => {
    const previousConsent = {
      analytics: false,
      errorReporting: true,
      timestamp: 1,
      version: '1.0'
    };
    const transaction = createDeviceLocalPrivacyTransaction(previousConsent, undefined);

    expect(readDeviceLocalPrivacyTransaction(transaction)).toEqual({
      phase: 'prepared',
      previousConsent,
      previousConfig: undefined
    });
  });
});
