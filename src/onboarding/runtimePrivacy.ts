import {
  getAnalyticsConfigManager,
  setAnalyticsConsent
} from '../shared/errors/analytics/analyticsConfig';
import { updateErrorAnalyticsConfig } from '../shared/errors/analytics';
import { resolveAnalyticsDebugMode } from '../shared/analytics';
import type { OnboardingPrivacyField, OnboardingPrivacySnapshot } from './dependencies';

/** Load the runtime consent integration only when the user changes a privacy control. */
export async function applyOnboardingRuntimePrivacy(
  snapshot: OnboardingPrivacySnapshot,
  field: OnboardingPrivacyField
): Promise<void> {
  const runtimeDebugMode = resolveAnalyticsDebugMode(snapshot);
  await setAnalyticsConsent(snapshot.analytics, snapshot.errorReporting);
  await getAnalyticsConfigManager().updateConfig({ debugMode: runtimeDebugMode });
  if (field === 'errorReporting') await updateErrorAnalyticsConfig(snapshot.errorReporting);
}
