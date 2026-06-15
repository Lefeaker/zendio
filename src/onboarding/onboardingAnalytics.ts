import { bucketDurationMs } from '../shared/analytics/featureTimer';
import {
  createAnalyticsEventMessage,
  type AnalyticsRuntimeEventPayload
} from '../shared/types/analytics';
import type { IMessagingRepository } from '../shared/repositories/IMessagingRepository';

const ONBOARDING_STEP_NAMES = {
  1: 'welcome',
  2: 'vault',
  3: 'privacy',
  4: 'shortcut',
  5: 'finish'
} as const;

type OnboardingStepNumber = keyof typeof ONBOARDING_STEP_NAMES;
type OnboardingStepName = (typeof ONBOARDING_STEP_NAMES)[OnboardingStepNumber];

export type OnboardingTrackingRequest =
  | { name: 'onboarding_started'; source: 'install' | 'options' }
  | { durationMs: number; name: 'onboarding_step_completed'; stepNumber: number }
  | { name: 'onboarding_skipped'; stepNumber: number }
  | { action: 'contact' | 'feedback' | 'docs'; name: 'onboarding_support_action' }
  | { durationMs: number; name: 'onboarding_completed' };

export async function sendOnboardingTrackingEvent(
  messagingRepository: Pick<IMessagingRepository, 'send'>,
  request: OnboardingTrackingRequest
): Promise<void> {
  const message = createOnboardingTrackingMessage(request);
  if (!message) {
    return;
  }

  await messagingRepository.send(message);
}

function createOnboardingTrackingMessage(
  request: OnboardingTrackingRequest
): AnalyticsRuntimeEventPayload | null {
  switch (request.name) {
    case 'onboarding_started':
      return createAnalyticsEventMessage('onboarding_started', { source: request.source });
    case 'onboarding_step_completed': {
      const step = resolveOnboardingStep(request.stepNumber);
      if (!step) {
        return null;
      }
      return createAnalyticsEventMessage('onboarding_step_completed', {
        step,
        duration_bucket: bucketDurationMs(request.durationMs)
      });
    }
    case 'onboarding_skipped': {
      const step = resolveOnboardingStep(request.stepNumber);
      if (!step) {
        return null;
      }
      return createAnalyticsEventMessage('onboarding_skipped', { step });
    }
    case 'onboarding_support_action':
      return createAnalyticsEventMessage('onboarding_support_action', {
        action: request.action
      });
    case 'onboarding_completed':
      return createAnalyticsEventMessage('onboarding_completed', {
        duration_bucket: bucketDurationMs(request.durationMs)
      });
    default:
      return null;
  }
}

function resolveOnboardingStep(stepNumber: number): OnboardingStepName | null {
  return ONBOARDING_STEP_NAMES[stepNumber as OnboardingStepNumber] ?? null;
}
