import type { StorageAreaService } from '../../platform/interfaces/storage';
import type {
  ActivationMilestone,
  ActiveDayBucket,
  UsageEventParamMap
} from '../../shared/types/analytics';

const ACTIVATION_STORAGE_KEY_PREFIX = 'analytics_activation_state:';

type ActivationTrackerFlag = ActivationMilestone | 'extension_installed';

interface ActivationTrackerState {
  firstConsentedActiveUtcDate?: string;
  lastEmittedActiveUtcDate?: string;
  emittedFlags?: Partial<Record<ActivationTrackerFlag, true>>;
}

let activationStorage: Pick<StorageAreaService, 'get' | 'set' | 'remove'> | null = null;
let lastKnownClientId: string | null = null;

export function configureActivationAnalyticsStorage(
  storage: Pick<StorageAreaService, 'get' | 'set' | 'remove'>
): void {
  activationStorage = storage;
}

export async function reconcileActivationAnalyticsIdentity(
  clientId?: string | null
): Promise<void> {
  const previousClientId = lastKnownClientId;
  lastKnownClientId = clientId ?? null;
  if (!activationStorage || !previousClientId || previousClientId === clientId) {
    return;
  }

  await activationStorage.remove(buildActivationStorageKey(previousClientId));
}

export async function trackExtensionInstalledIfNeeded(input: {
  clientId: string;
  trackEvent: () => Promise<boolean>;
}): Promise<void> {
  await trackFlagIfNeeded({
    clientId: input.clientId,
    flag: 'extension_installed',
    trackEvent: input.trackEvent
  });
}

export async function trackActivationMilestoneIfNeeded(input: {
  clientId: string;
  milestone: ActivationMilestone;
  trackEvent: () => Promise<boolean>;
}): Promise<void> {
  await trackFlagIfNeeded({
    clientId: input.clientId,
    flag: input.milestone,
    trackEvent: input.trackEvent
  });
}

export async function trackActivationActiveDayIfNeeded(input: {
  clientId: string;
  now?: () => Date;
  trackEvent: (params: UsageEventParamMap['extension_active_day']) => Promise<boolean>;
}): Promise<void> {
  if (!activationStorage) {
    return;
  }

  lastKnownClientId = input.clientId;
  const now = input.now ?? (() => new Date());
  const state = await readActivationState(input.clientId);
  const currentUtcDate = toUtcDateString(now());
  if (state.lastEmittedActiveUtcDate === currentUtcDate) {
    return;
  }

  const firstConsentedActiveUtcDate = state.firstConsentedActiveUtcDate ?? currentUtcDate;
  const tracked = await safelyTrackEvent(() =>
    input.trackEvent({
      day_index_bucket: toActiveDayBucket(diffUtcDays(firstConsentedActiveUtcDate, currentUtcDate))
    })
  );
  if (!tracked) {
    return;
  }

  await writeActivationState(input.clientId, {
    ...state,
    firstConsentedActiveUtcDate,
    lastEmittedActiveUtcDate: currentUtcDate
  });
}

async function trackFlagIfNeeded(input: {
  clientId: string;
  flag: ActivationTrackerFlag;
  trackEvent: () => Promise<boolean>;
}): Promise<void> {
  if (!activationStorage) {
    return;
  }

  lastKnownClientId = input.clientId;
  const state = await readActivationState(input.clientId);
  if (state.emittedFlags?.[input.flag]) {
    return;
  }

  const tracked = await safelyTrackEvent(input.trackEvent);
  if (!tracked) {
    return;
  }

  await writeActivationState(input.clientId, {
    ...state,
    emittedFlags: {
      ...(state.emittedFlags ?? {}),
      [input.flag]: true
    }
  });
}

async function safelyTrackEvent(trackEvent: () => Promise<boolean>): Promise<boolean> {
  try {
    return (await trackEvent()) === true;
  } catch {
    return false;
  }
}

async function readActivationState(clientId: string): Promise<ActivationTrackerState> {
  if (!activationStorage) {
    return {};
  }

  const stored = await activationStorage.get<ActivationTrackerState>(
    buildActivationStorageKey(clientId)
  );
  if (typeof stored !== 'object' || stored === null) {
    return {};
  }

  return {
    firstConsentedActiveUtcDate: normalizeUtcDate(stored.firstConsentedActiveUtcDate),
    lastEmittedActiveUtcDate: normalizeUtcDate(stored.lastEmittedActiveUtcDate),
    emittedFlags: normalizeEmittedFlags(stored.emittedFlags)
  };
}

async function writeActivationState(
  clientId: string,
  state: ActivationTrackerState
): Promise<void> {
  if (!activationStorage) {
    return;
  }

  await activationStorage.set(buildActivationStorageKey(clientId), state);
}

function buildActivationStorageKey(clientId: string): string {
  return `${ACTIVATION_STORAGE_KEY_PREFIX}${clientId}`;
}

function normalizeUtcDate(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function normalizeEmittedFlags(
  value: unknown
): Partial<Record<ActivationTrackerFlag, true>> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const emittedFlags = Object.entries(value).reduce<Partial<Record<ActivationTrackerFlag, true>>>(
    (result, [key, flagValue]) => {
      if (flagValue === true) {
        result[key as ActivationTrackerFlag] = true;
      }
      return result;
    },
    {}
  );

  return Object.keys(emittedFlags).length > 0 ? emittedFlags : undefined;
}

function toUtcDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function diffUtcDays(firstUtcDate: string, currentUtcDate: string): number {
  const [firstYear, firstMonth, firstDay] = firstUtcDate.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = currentUtcDate.split('-').map(Number);
  const firstTimestamp = Date.UTC(firstYear, firstMonth - 1, firstDay);
  const currentTimestamp = Date.UTC(currentYear, currentMonth - 1, currentDay);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((currentTimestamp - firstTimestamp) / millisecondsPerDay));
}

function toActiveDayBucket(dayIndex: number): ActiveDayBucket {
  if (dayIndex <= 0) {
    return 'day_0';
  }
  if (dayIndex === 1) {
    return 'day_1';
  }
  if (dayIndex <= 6) {
    return 'day_2_to_6';
  }
  if (dayIndex <= 29) {
    return 'day_7_to_29';
  }
  return 'day_30_plus';
}
