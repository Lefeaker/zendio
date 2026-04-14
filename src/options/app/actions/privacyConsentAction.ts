import type { IOptionsRepository } from '@shared/repositories';
import type { PrivacyConsentSnapshot } from '@ui/domains/privacy';

export async function persistPrivacyConsentAction(
  snapshot: PrivacyConsentSnapshot,
  dependencies: {
    optionsRepository: Pick<IOptionsRepository, 'set'>;
  }
): Promise<void> {
  await dependencies.optionsRepository.set({
    privacyPreferences: snapshot
  });
}
