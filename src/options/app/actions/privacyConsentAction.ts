import type { IOptionsRepository } from '@shared/repositories';
import type { PrivacyPreferencesOptions } from '@shared/types/options';

export async function persistPrivacyConsentAction(
  snapshot: PrivacyPreferencesOptions,
  dependencies: {
    optionsRepository: Pick<IOptionsRepository, 'patch'>;
  }
): Promise<void> {
  await dependencies.optionsRepository.patch([
    { path: ['privacyPreferences', 'analytics'], value: snapshot.analytics },
    { path: ['privacyPreferences', 'errorReporting'], value: snapshot.errorReporting },
    { path: ['privacyPreferences', 'debugMode'], value: snapshot.debugMode }
  ]);
}
