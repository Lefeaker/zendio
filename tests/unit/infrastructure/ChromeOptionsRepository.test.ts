import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeOptionsRepository } from '../../../src/infrastructure/repositories/ChromeOptionsRepository';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import { StorageError } from '@shared/errors';
import type { PlainStructuredValue } from '@shared/config/losslessObjectBoundaryTypes';
import type { CompleteOptions } from '@shared/types/options';
import type {
  StorageAreaService,
  StorageChangeCallback,
  StorageService
} from '../../../src/platform/interfaces/storage';
import {
  DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY,
  createPreparedDeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultRecoveryTransactionV3
} from '../../../src/shared/config/deviceLocalVaultRecoveryTransaction';

type MockableFunction = (...args: never[]) => void;

const createMockFn = <T extends MockableFunction>() =>
  vi.fn<(...args: Parameters<T>) => ReturnType<T>>();

const DEFAULT_COMPLETE_OPTIONS = DEFAULT_OPTIONS as CompleteOptions;
const publicationPrivacy0 = {
  analytics: false,
  errorReporting: false,
  debugMode: false
} as const;
const publicationPrivacy1 = { ...publicationPrivacy0, analytics: true } as const;
const publicationBindings0 = {
  version: 1 as const,
  bindings: { default: { folderId: 'folder-old', folderName: 'Old Folder' } }
};
const publicationBindings1 = {
  version: 1 as const,
  bindings: { default: { folderId: 'folder-new', folderName: 'New Folder' } }
};
const publicationPortable0 = { interfaceTheme: 'system', rest: { vault: 'Primary' } } as const;
const publicationPortable1 = { interfaceTheme: 'dark', rest: { vault: 'Primary' } } as const;

async function publicationTransaction(
  phase: 'prepared' | 'local-committed' | 'aborted'
): Promise<DeviceLocalVaultRecoveryTransactionV3> {
  const prepared = await createPreparedDeviceLocalVaultRecoveryTransaction({
    transactionId: 'repository-publication-1',
    previousBindings: publicationBindings0,
    proposedBindings: publicationBindings1,
    portablePreimage: publicationPortable0,
    portableProposal: publicationPortable1,
    writeRequired: true,
    privacyRestoreTarget: publicationPrivacy0,
    privacyForwardTarget: publicationPrivacy1,
    privacyWriteRequired: true
  });
  if (phase === 'prepared') return prepared;
  if (phase === 'aborted') {
    return { ...prepared, phase, abortReason: 'local-commit-failed' };
  }
  return {
    ...prepared,
    phase,
    portable: {
      ...prepared.portable,
      observedCommittedIdentity: prepared.portable.proposedIdentity
    },
    privacy: { ...prepared.privacy, observedForward: 'exact-target-readback' }
  };
}

type StorageAreaMock = StorageAreaService & {
  get: ReturnType<typeof createMockFn<StorageAreaService['get']>>;
  set: ReturnType<typeof createMockFn<StorageAreaService['set']>>;
  getMany: ReturnType<typeof createMockFn<StorageAreaService['getMany']>>;
  setMany: ReturnType<typeof createMockFn<StorageAreaService['setMany']>>;
  remove: ReturnType<typeof createMockFn<StorageAreaService['remove']>>;
  clear: ReturnType<typeof createMockFn<StorageAreaService['clear']>>;
  watchKey: ReturnType<typeof createMockFn<StorageAreaService['watchKey']>>;
  watchAll: ReturnType<typeof createMockFn<StorageAreaService['watchAll']>>;
};
type OptionsStorageChange = Parameters<StorageAreaService['watchKey']>[1];

// ===========================
// Helper Functions
// ===========================
function cloneOptions(options: CompleteOptions): CompleteOptions {
  return JSON.parse(JSON.stringify(options)) as CompleteOptions;
}

function withLegacyRootDir<TRest extends CompleteOptions['rest']>(
  rest: TRest,
  rootDir: string
): TRest & { rootDir: string } {
  return Object.assign(rest, { rootDir });
}

// ===========================
// Mock Platform Services
// ===========================
const createStorageAreaMock = (): StorageAreaMock => {
  const watchKey = createMockFn<StorageAreaService['watchKey']>().mockReturnValue(vi.fn());
  const watchAll = createMockFn<StorageAreaService['watchAll']>().mockReturnValue(vi.fn());
  return {
    get: createMockFn<StorageAreaService['get']>() as StorageAreaMock['get'],
    set: createMockFn<StorageAreaService['set']>(),
    getMany: createMockFn<StorageAreaService['getMany']>() as StorageAreaMock['getMany'],
    setMany: createMockFn<StorageAreaService['setMany']>(),
    remove: createMockFn<StorageAreaService['remove']>(),
    clear: createMockFn<StorageAreaService['clear']>(),
    watchKey,
    watchAll
  } as StorageAreaMock;
};

const mockStorage: StorageService & {
  sync: StorageAreaMock;
  local: StorageAreaMock;
  session: StorageAreaMock;
} = {
  sync: createStorageAreaMock(),
  local: createStorageAreaMock(),
  session: createStorageAreaMock()
};

type PublicationNotificationState = {
  raw: PlainStructuredValue;
  consent: {
    analytics: boolean;
    errorReporting: boolean;
    timestamp: number;
    version: string;
  };
  bindings: typeof publicationBindings0;
  journal: unknown;
};

async function setupPublicationNotifications(repo: ChromeOptionsRepository) {
  const state: PublicationNotificationState = {
    raw: publicationPortable0,
    consent: {
      analytics: false,
      errorReporting: false,
      timestamp: 1,
      version: '1.0'
    },
    bindings: publicationBindings0,
    journal: undefined
  };
  let journalReads = 0;
  let syncChange: OptionsStorageChange | undefined;
  const localChanges = new Map<string, OptionsStorageChange>();
  mockStorage.sync.get.mockImplementation(() => Promise.resolve(structuredClone(state.raw)));
  mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
    syncChange = callback;
    return vi.fn();
  });
  mockStorage.local.get.mockImplementation((key) => {
    if (key === DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY) {
      journalReads += 1;
      return Promise.resolve(structuredClone(state.journal));
    }
    if (key === 'analytics_user_consent') {
      return Promise.resolve(structuredClone(state.consent));
    }
    if (key === 'analytics_config') return Promise.resolve({ debugMode: false });
    if (key === 'deviceLocalVaultBindings') {
      return Promise.resolve(structuredClone(state.bindings));
    }
    return Promise.resolve(undefined);
  });
  mockStorage.local.watchKey.mockImplementation((key, callback) => {
    localChanges.set(key, callback);
    return vi.fn();
  });
  const callback = vi.fn<(options: CompleteOptions) => void>();
  repo.onChange(callback);
  await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  callback.mockClear();

  return {
    state,
    callback,
    journalReads: () => journalReads,
    emitSync: (stored: PlainStructuredValue) => syncChange?.(stored, { newValue: stored }),
    emitJournal: () =>
      localChanges.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)?.(state.journal, {
        newValue: state.journal
      })
  };
}

// ===========================
// Test Suite
// ===========================
describe('ChromeOptionsRepository', () => {
  let repo: ChromeOptionsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.sync.get.mockReset();
    mockStorage.sync.set.mockReset();
    mockStorage.sync.watchKey.mockReset();
    mockStorage.sync.watchAll.mockReset();
    mockStorage.local.get.mockReset();
    mockStorage.local.set.mockReset();
    mockStorage.local.setMany.mockReset();
    mockStorage.local.remove.mockReset();
    mockStorage.local.watchKey.mockReset();
    mockStorage.local.watchAll.mockReset();
    mockStorage.sync.set.mockResolvedValue(undefined);
    mockStorage.local.set.mockResolvedValue(undefined);
    mockStorage.local.setMany.mockResolvedValue(undefined);
    mockStorage.local.remove.mockResolvedValue(undefined);
    mockStorage.local.watchKey.mockReturnValue(vi.fn());
    repo = new ChromeOptionsRepository(mockStorage);
  });

  // ===========================
  // 核心验证：onChange 单次触发
  // ===========================
  describe('onChange triggering', () => {
    it('publishes no partial snapshot and one final snapshot when the journal opens', async () => {
      let raw: PlainStructuredValue = publicationPortable0;
      let consent = {
        analytics: false,
        errorReporting: false,
        timestamp: 1,
        version: '1.0'
      };
      let currentBindings = publicationBindings0;
      let journal: unknown;
      let journalReads = 0;
      let syncChange: OptionsStorageChange | undefined;
      const localChanges = new Map<string, OptionsStorageChange>();
      mockStorage.sync.get.mockImplementation(() => Promise.resolve(structuredClone(raw)));
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        syncChange = callback;
        return vi.fn();
      });
      mockStorage.local.get.mockImplementation((key) => {
        if (key === DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY) {
          journalReads += 1;
          return Promise.resolve(structuredClone(journal));
        }
        if (key === 'analytics_user_consent') return Promise.resolve(structuredClone(consent));
        if (key === 'analytics_config') return Promise.resolve({ debugMode: false });
        if (key === 'deviceLocalVaultBindings')
          return Promise.resolve(structuredClone(currentBindings));
        return Promise.resolve(undefined);
      });
      mockStorage.local.watchKey.mockImplementation((key, callback) => {
        localChanges.set(key, callback);
        return vi.fn();
      });
      const callback = vi.fn<(options: CompleteOptions) => void>();
      repo.onChange(callback);
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      callback.mockClear();

      journal = await publicationTransaction('prepared');
      raw = publicationPortable1;
      consent = { ...consent, analytics: true, timestamp: 2 };
      currentBindings = publicationBindings1;
      syncChange?.(raw, { newValue: raw });
      localChanges.get('analytics_user_consent')?.(consent, { newValue: consent });
      localChanges.get('deviceLocalVaultBindings')?.(currentBindings, {
        newValue: currentBindings
      });
      await vi.waitFor(() => expect(journalReads).toBeGreaterThanOrEqual(5));
      expect(callback).not.toHaveBeenCalled();

      journal = await publicationTransaction('local-committed');
      localChanges.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)?.(journal, {
        newValue: journal
      });
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interfaceTheme: 'dark',
          privacyPreferences: expect.objectContaining({ analytics: true }),
          rest: expect.objectContaining({ localFolderId: 'folder-new' })
        })
      );

      journal = undefined;
      localChanges.get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)?.(undefined, {
        newValue: undefined
      });
      await vi.waitFor(() => expect(journalReads).toBeGreaterThanOrEqual(9));
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('publishes zero changes when a closed transaction rolls back to its preimage', async () => {
      let raw: PlainStructuredValue = publicationPortable0;
      let consent = {
        analytics: false,
        errorReporting: false,
        timestamp: 1,
        version: '1.0'
      };
      let currentBindings = publicationBindings0;
      let journal: unknown;
      let journalReads = 0;
      let syncChange: OptionsStorageChange | undefined;
      let journalChange: OptionsStorageChange | undefined;
      mockStorage.sync.get.mockImplementation(() => Promise.resolve(structuredClone(raw)));
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        syncChange = callback;
        return vi.fn();
      });
      mockStorage.local.get.mockImplementation((key) => {
        if (key === DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY) {
          journalReads += 1;
          return Promise.resolve(structuredClone(journal));
        }
        if (key === 'analytics_user_consent') return Promise.resolve(structuredClone(consent));
        if (key === 'analytics_config') return Promise.resolve({ debugMode: false });
        if (key === 'deviceLocalVaultBindings')
          return Promise.resolve(structuredClone(currentBindings));
        return Promise.resolve(undefined);
      });
      mockStorage.local.watchKey.mockImplementation((key, callback) => {
        if (key === DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY) journalChange = callback;
        return vi.fn();
      });
      const callback = vi.fn<(options: CompleteOptions) => void>();
      repo.onChange(callback);
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      callback.mockClear();

      journal = await publicationTransaction('prepared');
      raw = publicationPortable1;
      consent = { ...consent, analytics: true, timestamp: 2 };
      currentBindings = publicationBindings1;
      syncChange?.(raw, { newValue: raw });
      await vi.waitFor(() => expect(journalReads).toBeGreaterThanOrEqual(3));
      expect(callback).not.toHaveBeenCalled();

      raw = publicationPortable0;
      consent = { ...consent, analytics: false, timestamp: 3 };
      currentBindings = publicationBindings0;
      journal = await publicationTransaction('aborted');
      journalChange?.(journal, { newValue: journal });
      await vi.waitFor(() => expect(journalReads).toBeGreaterThanOrEqual(5));
      journal = undefined;
      journalChange?.(undefined, { newValue: undefined });
      await vi.waitFor(() => expect(journalReads).toBeGreaterThanOrEqual(7));
      expect(callback).not.toHaveBeenCalled();
    });

    it('rejects a delayed proposal event after rollback has removed the journal', async () => {
      const scenario = await setupPublicationNotifications(repo);

      scenario.state.journal = await publicationTransaction('prepared');
      scenario.state.raw = publicationPortable1;
      scenario.state.consent = { ...scenario.state.consent, analytics: true, timestamp: 2 };
      scenario.state.bindings = publicationBindings1;
      scenario.emitSync(publicationPortable1);
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(3));
      expect(scenario.callback).not.toHaveBeenCalled();

      scenario.state.raw = publicationPortable0;
      scenario.state.consent = { ...scenario.state.consent, analytics: false, timestamp: 3 };
      scenario.state.bindings = publicationBindings0;
      scenario.state.journal = await publicationTransaction('aborted');
      scenario.emitJournal();
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(5));
      scenario.state.journal = undefined;
      scenario.emitJournal();
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(7));

      scenario.emitSync(publicationPortable1);
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(9));
      expect(scenario.callback).not.toHaveBeenCalled();
    });

    it('deduplicates a delayed matching proposal event after successful publication', async () => {
      const scenario = await setupPublicationNotifications(repo);

      scenario.state.journal = await publicationTransaction('prepared');
      scenario.state.raw = publicationPortable1;
      scenario.state.consent = { ...scenario.state.consent, analytics: true, timestamp: 2 };
      scenario.state.bindings = publicationBindings1;
      scenario.emitSync(publicationPortable1);
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(3));
      expect(scenario.callback).not.toHaveBeenCalled();

      scenario.state.journal = await publicationTransaction('local-committed');
      scenario.emitJournal();
      await vi.waitFor(() => expect(scenario.callback).toHaveBeenCalledTimes(1));
      scenario.state.journal = undefined;
      scenario.emitJournal();
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(7));
      scenario.emitSync(publicationPortable1);
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(9));

      expect(scenario.callback).toHaveBeenCalledTimes(1);
      expect(scenario.callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interfaceTheme: 'dark',
          privacyPreferences: expect.objectContaining({ analytics: true }),
          rest: expect.objectContaining({ localFolderId: 'folder-new' })
        })
      );
    });

    it('publishes the current third state once when a delayed proposal event arrives last', async () => {
      const scenario = await setupPublicationNotifications(repo);

      scenario.state.journal = await publicationTransaction('prepared');
      scenario.state.raw = publicationPortable1;
      scenario.emitSync(publicationPortable1);
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(3));
      expect(scenario.callback).not.toHaveBeenCalled();

      scenario.state.raw = { interfaceTheme: 'light', rest: { vault: 'Third' } };
      scenario.state.journal = await publicationTransaction('aborted');
      scenario.emitJournal();
      await vi.waitFor(() => expect(scenario.callback).toHaveBeenCalledTimes(1));
      scenario.state.journal = undefined;
      scenario.emitJournal();
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(7));
      scenario.emitSync(publicationPortable1);
      await vi.waitFor(() => expect(scenario.journalReads()).toBeGreaterThanOrEqual(9));

      expect(scenario.callback).toHaveBeenCalledTimes(1);
      expect(scenario.callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interfaceTheme: 'light',
          rest: expect.objectContaining({ vault: 'Third' })
        })
      );
    });
    it('should trigger onChange callback exactly once for a storage watcher update', async () => {
      const initialOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      initialOptions.rest.baseUrl = 'https://initial.example/';

      const updatedOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      updatedOptions.rest.baseUrl = 'https://updated.example/';

      mockStorage.sync.get.mockResolvedValue(initialOptions);
      let externalChange: OptionsStorageChange | undefined;
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        externalChange = callback;
        return vi.fn();
      });

      const callback = vi.fn<(options: CompleteOptions) => void>();

      // Subscribe to onChange
      repo.onChange(callback);

      // Wait for initial trigger
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });

      // Clear initial trigger count
      callback.mockClear();

      mockStorage.sync.get.mockResolvedValue(updatedOptions);
      externalChange?.(updatedOptions, { newValue: updatedOptions });

      // Wait for onChange to process
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // ✅ Critical assertion: Should be called EXACTLY ONCE, not twice
      expect(callback).toHaveBeenCalledTimes(1);
      const callbackCalls = callback.mock.calls as Array<[CompleteOptions]>;
      const callbackArg = callbackCalls[0]?.[0];
      expect(callbackArg?.rest.baseUrl).toBe('https://updated.example/');

      expect(mockStorage.sync.watchKey).toHaveBeenCalledWith('options', expect.any(Function));
    });

    it('should notify subscribers when options are changed from another extension context', async () => {
      const initialOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      const externalOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      externalOptions.interfaceTheme = 'light';
      mockStorage.sync.get.mockResolvedValue(initialOptions);
      let externalChange: OptionsStorageChange | undefined;
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        externalChange = callback;
        return vi.fn();
      });

      const callback = vi.fn();
      repo.onChange(callback);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });
      callback.mockClear();

      expect(externalChange).toBeDefined();
      mockStorage.sync.get.mockResolvedValue(externalOptions);
      externalChange?.(externalOptions, { newValue: externalOptions });

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ interfaceTheme: 'light' }));
    });

    it('should decode legacy watcher values without scheduling migration writes', async () => {
      mockStorage.sync.get.mockResolvedValue(DEFAULT_COMPLETE_OPTIONS);
      let externalChange: StorageChangeCallback<object | null> | undefined;
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        externalChange = (value, change) => callback(value, change);
        return vi.fn();
      });
      const callback = vi.fn<(options: CompleteOptions) => void>();
      repo.onChange(callback);
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      callback.mockClear();

      const watchedValue = {
        templates: { clipper: 'Watched legacy template' },
        fragmentClipper: { selectionModifierEnabled: false }
      };
      mockStorage.sync.get.mockResolvedValue(watchedValue);
      externalChange?.(watchedValue, { newValue: watchedValue });

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      const emitted = callback.mock.calls[0]?.[0];
      expect(emitted?.templates.fragment).toBe('Watched legacy template');
      expect(emitted?.fragmentClipper.selectionTriggerMode).toBe('direct');
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should emit initial state immediately when onChange is called', async () => {
      const initialOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      initialOptions.rest.vault = 'InitialVault';
      mockStorage.sync.get.mockResolvedValue(initialOptions);

      const callback = vi.fn();
      repo.onChange(callback);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });

      const callbackCalls = callback.mock.calls as Array<[CompleteOptions]>;
      const callbackArg = callbackCalls[0]?.[0];
      expect(callbackArg?.rest.vault).toBe('InitialVault');
    });

    it('should unsubscribe correctly and detach the storage watcher for the last listener', async () => {
      const initialOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      initialOptions.rest.vault = 'InitialVault';
      mockStorage.sync.get.mockResolvedValue(initialOptions);
      const stopWatching = vi.fn();
      mockStorage.sync.watchKey.mockReturnValue(stopWatching);

      const callback = vi.fn();
      const unsubscribe = repo.onChange(callback);

      // Wait for initial trigger
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });

      // Unsubscribe
      unsubscribe();

      // Clear and verify no more triggers
      callback.mockClear();
      const newOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      newOptions.rest.baseUrl = 'https://unsubscribed.example/';
      const watcher = mockStorage.sync.watchKey.mock.calls[0]?.[1];
      watcher?.(newOptions, { newValue: newOptions });

      // Wait a bit to ensure callback is not called
      await new Promise((resolve) => setTimeout(resolve, 100));

      // ✅ Should NOT be called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
      expect(stopWatching).toHaveBeenCalledTimes(1);
    });

    it('should notify multiple subscribers when options change', async () => {
      const initialOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      initialOptions.rest.vault = 'MultiVault';
      const updatedOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      updatedOptions.rest.baseUrl = 'https://multi.example/';

      mockStorage.sync.get.mockResolvedValue(initialOptions);
      let externalChange: OptionsStorageChange | undefined;
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        externalChange = callback;
        return vi.fn();
      });

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      repo.onChange(callback1);
      repo.onChange(callback2);

      await vi.waitFor(() => {
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
      });

      callback1.mockClear();
      callback2.mockClear();

      mockStorage.sync.get.mockResolvedValue(updatedOptions);
      externalChange?.(updatedOptions, { newValue: updatedOptions });

      await vi.waitFor(() => {
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
      });
      const callback1Calls = callback1.mock.calls as Array<[CompleteOptions]>;
      const callback2Calls = callback2.mock.calls as Array<[CompleteOptions]>;
      const callbackArg1 = callback1Calls[0]?.[0];
      const callbackArg2 = callback2Calls[0]?.[0];
      expect(callbackArg1?.rest.baseUrl).toBe('https://multi.example/');
      expect(callbackArg2?.rest.baseUrl).toBe('https://multi.example/');
    });

    it('suppresses a deferred stale privacy read after a newer local event', async () => {
      let releaseInitialConsent: ((value: PlainStructuredValue) => void) | undefined;
      const initialConsent = new Promise<PlainStructuredValue>((resolve) => {
        releaseInitialConsent = resolve;
      });
      let consentReads = 0;
      let localConsentChange: StorageChangeCallback<PlainStructuredValue> | undefined;
      let syncOptionsChange: OptionsStorageChange | undefined;
      mockStorage.sync.get.mockResolvedValue({ interfaceTheme: 'system' });
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        syncOptionsChange = callback;
        return vi.fn();
      });
      mockStorage.local.get.mockImplementation((key) => {
        if (key === 'analytics_user_consent') {
          consentReads += 1;
          return consentReads === 1
            ? initialConsent
            : Promise.resolve({
                analytics: true,
                errorReporting: false,
                timestamp: 2,
                version: '1.0'
              });
        }
        return Promise.resolve(undefined);
      });
      mockStorage.local.watchKey.mockImplementation((key, callback) => {
        if (key === 'analytics_user_consent') localConsentChange = callback;
        return vi.fn();
      });
      const callback = vi.fn<(options: CompleteOptions) => void>();

      repo.onChange(callback);
      await vi.waitFor(() => expect(consentReads).toBe(1));
      syncOptionsChange?.({ interfaceTheme: 'light' }, { newValue: { interfaceTheme: 'light' } });
      mockStorage.sync.get.mockResolvedValue({ interfaceTheme: 'light' });
      localConsentChange?.(
        { analytics: true, errorReporting: false, timestamp: 2, version: '1.0' },
        { newValue: { analytics: true, errorReporting: false, timestamp: 2, version: '1.0' } }
      );
      releaseInitialConsent?.({
        analytics: false,
        errorReporting: false,
        timestamp: 1,
        version: '1.0'
      });

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interfaceTheme: 'light',
          privacyPreferences: {
            analytics: true,
            errorReporting: false,
            debugMode: false
          }
        })
      );
    });
  });

  // ===========================
  // get() 测试
  // ===========================
  describe('get()', () => {
    it('projects P0/R/B0 while a valid v3 transaction is nonterminal', async () => {
      mockStorage.local.get.mockImplementation((key) =>
        key === DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY
          ? publicationTransaction('prepared')
          : Promise.resolve(undefined)
      );
      mockStorage.sync.get.mockResolvedValue(publicationPortable1);

      const result = await repo.get();

      expect(result.interfaceTheme).toBe('system');
      expect(result.privacyPreferences).toEqual(publicationPrivacy0);
      expect(result.rest).toMatchObject({
        vault: 'Primary',
        localFolderId: 'folder-old',
        localFolderName: 'Old Folder'
      });
      expect(mockStorage.sync.get).not.toHaveBeenCalled();
      await expect(repo.readRaw()).resolves.toEqual(publicationPortable1);
    });
    it('should return merged options from storage', async () => {
      const storedOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      storedOptions.rest.baseUrl = 'https://stored.example/';
      mockStorage.sync.get.mockResolvedValue(storedOptions);

      const result = await repo.get();

      expect(mockStorage.sync.get).toHaveBeenCalledWith('options');
      expect(result.rest.baseUrl).toBe('https://stored.example/');
      expect(result.templates.fragment).toBe(DEFAULT_COMPLETE_OPTIONS.templates.fragment);
      expect(result.domainMappings).toEqual(DEFAULT_COMPLETE_OPTIONS.domainMappings);
    });

    it('should return default options when storage is empty', async () => {
      mockStorage.sync.get.mockResolvedValue(null);

      const result = await repo.get();

      expect(result).toEqual(DEFAULT_COMPLETE_OPTIONS);
    });

    it.each([
      [true, 'modifier'],
      [false, 'direct']
    ] as const)(
      'should migrate the retired selection modifier flag %s as %s without read writeback',
      async (legacyEnabled, expectedMode) => {
        mockStorage.sync.get.mockResolvedValue({
          fragmentClipper: {
            selectionModifierEnabled: legacyEnabled,
            selectionModifierKeys: ['shift']
          }
        });

        const result = await repo.get();

        expect(result.fragmentClipper.selectionTriggerMode).toBe(expectedMode);
        expect(mockStorage.sync.set).not.toHaveBeenCalled();
      }
    );

    it('should not rewrite storage when selection trigger configuration is current', async () => {
      mockStorage.sync.get.mockResolvedValue({
        fragmentClipper: {
          selectionTriggerMode: 'direct',
          selectionModifierKeys: ['shift']
        }
      });

      const result = await repo.get();

      expect(result.fragmentClipper.selectionTriggerMode).toBe('direct');
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should migrate legacy template, video, and taxonomy data without read writeback', async () => {
      mockStorage.sync.get.mockResolvedValue({
        templates: { clipper: 'Legacy/{{title}}.md' },
        video: {
          controlBarAutoPauseEnabled: false,
          controlBarCaptureScreenshotEnabled: false
        },
        classifier: { taxonomy: { type: ['article'], topics: ['research'] } }
      });

      const result = await repo.get();

      expect(result.templates.fragment).toBe('Legacy/{{title}}.md');
      expect(result.templates.reading).toBe('Legacy/{{title}}.md');
      expect(result.video.controlBarAutoPause).toBe(false);
      expect(result.video.controlBarScreenshot).toBe(false);
      expect(result.classifier.taxonomy.name).toBe('Migrated Taxonomy');
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should salvage valid sections when REST, taxonomy, YAML, and Vault roots are malformed', async () => {
      mockStorage.sync.get.mockResolvedValue({
        interfaceTheme: 'light',
        templates: { article: 'Articles/{{title}}.md' },
        rest: { baseUrl: 'not a url', apiKey: '' },
        classifier: {
          taxonomy: {
            version: '1',
            categories: [{ id: 'bad', name: 'Bad', keywords: null }],
            tags: [],
            rules: []
          }
        },
        yamlConfig: { contentTypes: { article: { fields: null } } },
        vaultRouter: { vaults: [{ id: 'broken' }] }
      });

      const result = await repo.get();

      expect(result.interfaceTheme).toBe('light');
      expect(result.templates.article).toBe('Articles/{{title}}.md');
      expect(result.rest).toEqual(DEFAULT_COMPLETE_OPTIONS.rest);
      expect(result.classifier.taxonomy).toEqual(DEFAULT_COMPLETE_OPTIONS.classifier.taxonomy);
      expect(result.yamlConfig).toBeUndefined();
      expect(result.vaultRouter).toBeUndefined();
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should round-trip the shipped empty REST apiKey through the read boundary', async () => {
      mockStorage.sync.get.mockResolvedValue({
        rest: {
          baseUrl: DEFAULT_COMPLETE_OPTIONS.rest.baseUrl,
          vault: DEFAULT_COMPLETE_OPTIONS.rest.vault,
          apiKey: ''
        }
      });

      const result = await repo.get();

      expect(result.rest.apiKey).toBe('');
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should preserve the shipped empty REST apiKey through a raw write/read round trip', async () => {
      let stored: unknown = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      mockStorage.sync.get.mockImplementation(() => Promise.resolve(stored));
      mockStorage.sync.set.mockImplementation((_key, value) => {
        stored = value;
        return Promise.resolve();
      });

      await repo.writeRaw({
        rest: {
          ...DEFAULT_COMPLETE_OPTIONS.rest,
          apiKey: ''
        }
      });
      const result = await repo.get();

      expect(result.rest.apiKey).toBe('');
      expect(mockStorage.sync.set).toHaveBeenCalledTimes(1);
    });

    it('should preserve a full optional taxonomy exactly through the repository read boundary', async () => {
      const taxonomy = {
        version: '2.0.0',
        name: 'Repository taxonomy',
        description: 'All optional fields',
        descriptionKey: 'taxonomy.repository',
        classificationHint: 'Classify repository input',
        categories: [
          {
            id: 'research',
            name: 'Research',
            description: 'Research material',
            descriptionKey: 'taxonomy.category.research',
            classificationHint: 'Academic work',
            parent: 'knowledge',
            keywords: ['paper'],
            weight: 0.8
          }
        ],
        tags: [
          {
            id: 'review',
            name: 'Review',
            description: 'Review later',
            descriptionKey: 'taxonomy.tag.review',
            classificationHint: 'Queue for review',
            category: 'research',
            color: '#123456',
            aliases: ['later']
          }
        ],
        rules: [
          {
            id: 'r1',
            name: 'Research domain',
            description: 'Assign research',
            conditions: [
              {
                type: 'domain',
                operator: 'endsWith',
                value: '.example.edu',
                caseSensitive: false
              }
            ],
            actions: [
              {
                type: 'assignCategory',
                target: 'category',
                value: 'research',
                metadata: { origin: 'repository' }
              }
            ],
            priority: 2,
            enabled: true
          }
        ],
        defaultCategory: 'research',
        defaultTags: ['review'],
        settings: {
          autoClassification: true,
          confidenceThreshold: 0.75,
          maxCategories: 2,
          maxTags: 3,
          fallbackBehavior: 'prompt',
          customPrompts: { classify: 'Classify this' }
        }
      };
      mockStorage.sync.get.mockResolvedValue({ classifier: { taxonomy } });

      const result = await repo.get();

      expect(result.classifier.taxonomy).toEqual(taxonomy);
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should merge partial options with defaults when storage has sparse data', async () => {
      mockStorage.sync.get.mockResolvedValue({
        rest: {
          baseUrl: 'https://partial.example/'
        }
      } as Partial<CompleteOptions>);

      const result = await repo.get();

      expect(result.rest.baseUrl).toBe('https://partial.example/');
      expect(result.templates.fragment).toBe(DEFAULT_COMPLETE_OPTIONS.templates.fragment);
      expect(result.domainMappings).toEqual(DEFAULT_COMPLETE_OPTIONS.domainMappings);
    });

    it('should strip unknown root fields while preserving named persisted settings', async () => {
      mockStorage.sync.get.mockResolvedValue({
        rest: {
          baseUrl: 'https://stored.example/',
          apiKey: 'REST_SECRET_TOKEN'
        },
        aiChat: {
          userName: 'Stored User'
        },
        customKey: {
          hello: 'world'
        }
      } as unknown as Partial<CompleteOptions> & Record<string, unknown>);

      const result = await repo.get();

      expect(result.rest.apiKey).toBe('REST_SECRET_TOKEN');
      expect(result.aiChat?.userName).toBe('Stored User');
      expect((result as Record<string, unknown>).customKey).toBeUndefined();
    });

    it('composes device-local privacy instead of synchronized privacy preferences', async () => {
      mockStorage.sync.get.mockResolvedValue({
        privacyPreferences: {
          analytics: false,
          errorReporting: true,
          debugMode: true
        },
        opaqueRoot: { keep: true }
      } as Partial<CompleteOptions>);
      mockStorage.local.get.mockImplementation((key) => {
        if (key === 'analytics_user_consent') {
          return Promise.resolve({
            analytics: true,
            errorReporting: false,
            timestamp: 1,
            version: '1.0'
          });
        }
        if (key === 'analytics_config') return Promise.resolve({ debugMode: true });
        return Promise.resolve(undefined);
      });

      const result = await repo.get();

      expect(result.privacyPreferences).toEqual({
        analytics: true,
        errorReporting: false,
        debugMode: true
      });
    });

    it('composes device-local vault bindings over synchronized folder mirrors', async () => {
      mockStorage.sync.get.mockResolvedValue({
        rest: {
          vault: 'Primary',
          localFolderId: 'foreign-sync-id',
          localFolderName: 'Foreign Sync Name'
        },
        vaultRouter: {
          defaultVaultId: 'primary',
          vaults: [
            {
              id: 'primary',
              name: 'Primary',
              vault: 'Primary',
              httpsUrl: '',
              httpUrl: '',
              apiKey: '',
              localFolderId: 'foreign-sync-id',
              localFolderName: 'Foreign Sync Name'
            }
          ]
        }
      });
      mockStorage.local.get.mockImplementation((key) => {
        if (key === 'deviceLocalVaultBindings') {
          return Promise.resolve({
            version: 1,
            bindings: {
              primary: { folderId: 'folder-local', folderName: 'Local Folder' }
            }
          });
        }
        return Promise.resolve(undefined);
      });

      const result = await repo.get();

      expect(result.rest.localFolderId).toBe('folder-local');
      expect(result.rest.localFolderName).toBe('Local Folder');
      expect(result.vaultRouter?.vaults[0]?.localFolderId).toBe('folder-local');
      expect(result.vaultRouter?.vaults[0]?.localFolderName).toBe('Local Folder');
    });

    it('should still load old stored options with legacy rootDir while stripping it', async () => {
      mockStorage.sync.get.mockResolvedValue({
        rest: withLegacyRootDir(
          {
            baseUrl: 'https://stored.example/',
            vault: 'LegacyVault',
            apiKey: 'REST_SECRET_TOKEN'
          },
          'LegacyRoot/'
        )
      });

      const result = await repo.get();

      expect(result.rest).not.toHaveProperty('rootDir');
      expect(result.rest.vault).toBe('LegacyVault');
    });

    it('should throw StorageError when storage.get fails', async () => {
      const failure = new Error('storage unavailable');
      mockStorage.sync.get.mockRejectedValue(failure);

      const attempt = repo.get();

      await expect(attempt).rejects.toBeInstanceOf(StorageError);
      await expect(attempt).rejects.toThrow('Failed to read raw options from chrome.storage');
    });
  });

  // ===========================
  // background raw service tests
  // ===========================
  describe('raw storage service', () => {
    it('writes the exact coordinator-owned raw snapshot', async () => {
      const next = { interfaceTheme: 'dark', opaqueRoot: { preserved: true } };

      await repo.writeRaw(next);

      expect(mockStorage.sync.set).toHaveBeenCalledWith('options', next);
    });

    it('returns a clone of the raw snapshot', async () => {
      const stored = { opaqueRoot: { preserved: true } };
      mockStorage.sync.get.mockResolvedValue(stored);

      const raw = await repo.readRaw();
      expect(raw).toEqual(stored);
      expect(raw).not.toBe(stored);
    });

    it('should throw StorageError when storage.set fails', async () => {
      mockStorage.sync.set.mockRejectedValue(new Error('quota exceeded'));

      const attempt = repo.writeRaw({ interfaceTheme: 'dark' });

      await expect(attempt).rejects.toBeInstanceOf(StorageError);
      await expect(attempt).rejects.toThrow('Failed to write raw options to chrome.storage');
    });

    it('maps undefined storage values to an empty raw boundary', async () => {
      mockStorage.sync.get.mockResolvedValue(undefined);
      await expect(repo.readRaw()).resolves.toBeNull();
    });
  });

  describe('immutability & listener safety', () => {
    it('should deliver deep-cloned snapshots to listeners', async () => {
      const initialOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      const updatedOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      updatedOptions.rest.vault = 'ImmutableVault';
      let stored = initialOptions;
      mockStorage.sync.get.mockImplementation(() => Promise.resolve(stored));
      let externalChange: OptionsStorageChange | undefined;
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        externalChange = callback;
        return vi.fn();
      });

      let receivedOptions: CompleteOptions | null = null;
      repo.onChange((options) => {
        receivedOptions = options;
      });

      await vi.waitFor(() => {
        expect(receivedOptions).not.toBeNull();
      });

      receivedOptions = null;

      stored = updatedOptions;
      externalChange?.(updatedOptions, { newValue: updatedOptions });

      await vi.waitFor(() => {
        expect(receivedOptions).not.toBeNull();
      });

      const clonedOptions = receivedOptions as unknown as CompleteOptions;
      if (!clonedOptions) {
        throw new Error('Received options missing');
      }
      clonedOptions.rest.vault = 'MUTATED';
      const latest = await repo.get();
      expect(latest.rest.vault).toBe('ImmutableVault');
      expect(latest.rest.vault).not.toBe(clonedOptions.rest.vault);
    });

    it('should continue notifying other listeners when one throws', async () => {
      const initialOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      const updatedOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      updatedOptions.rest.baseUrl = 'https://listener.example/';

      mockStorage.sync.get.mockResolvedValue(initialOptions);
      let externalChange: OptionsStorageChange | undefined;
      mockStorage.sync.watchKey.mockImplementation((_key, callback) => {
        externalChange = callback;
        return vi.fn();
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const faultyListener = vi.fn(() => {
        throw new Error('listener boom');
      });
      const healthyListener = vi.fn();

      repo.onChange(faultyListener);
      repo.onChange(healthyListener);

      await vi.waitFor(() => {
        expect(faultyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledTimes(1);
      });

      faultyListener.mockClear();
      healthyListener.mockClear();
      consoleSpy.mockClear();

      mockStorage.sync.get.mockResolvedValue(updatedOptions);
      externalChange?.(updatedOptions, { newValue: updatedOptions });

      await vi.waitFor(() => {
        expect(healthyListener).toHaveBeenCalledTimes(1);
        expect(faultyListener).toHaveBeenCalledTimes(1);
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('environment compatibility', () => {
    it('should leverage global structuredClone when available', async () => {
      const globalRef = globalThis as typeof globalThis & { structuredClone?: <T>(value: T) => T };
      const originalStructuredClone = globalRef.structuredClone;

      const structuredCloneSpy = vi.fn<(value: unknown) => unknown>(
        (value) => JSON.parse(JSON.stringify(value)) as unknown
      );
      globalRef.structuredClone = <T>(value: T) => structuredCloneSpy(value) as T;

      const currentOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      const updatedUrl = 'https://structured.example/';

      mockStorage.sync.get.mockResolvedValue(currentOptions);

      try {
        await repo.get();
        await repo.writeRaw({
          rest: {
            ...currentOptions.rest,
            baseUrl: updatedUrl
          }
        });

        expect(structuredCloneSpy).toHaveBeenCalled();
      } finally {
        globalRef.structuredClone = originalStructuredClone;
      }
    });

    it('should fall back to JSON cloning when structuredClone is unavailable', async () => {
      const globalRef = globalThis as typeof globalThis & { structuredClone?: <T>(value: T) => T };
      const originalStructuredClone = globalRef.structuredClone;
      Reflect.deleteProperty(globalRef, 'structuredClone');

      const currentOptions = cloneOptions(DEFAULT_COMPLETE_OPTIONS);
      const updatedUrl = 'https://json-clone.example/';

      try {
        await repo.writeRaw({
          rest: {
            ...currentOptions.rest,
            baseUrl: updatedUrl
          }
        });

        const lastCall = mockStorage.sync.set.mock.calls.at(-1);
        if (!lastCall) {
          throw new Error('Expected storage.set to be called');
        }
        const [, savedOptions] = lastCall;
        expect((savedOptions as CompleteOptions).rest.baseUrl).toBe(updatedUrl);
      } finally {
        globalRef.structuredClone = originalStructuredClone;
      }
    });
  });

  describe('error handling around notifications', () => {
    it('suppresses late initial hydration after unsubscribe', async () => {
      let resolveInitial: ((value: CompleteOptions) => void) | undefined;
      mockStorage.sync.get.mockReturnValue(
        new Promise<CompleteOptions>((resolve) => {
          resolveInitial = resolve;
        })
      );
      const callback = vi.fn();
      const unsubscribe = repo.onChange(callback);

      unsubscribe();
      resolveInitial?.(cloneOptions(DEFAULT_COMPLETE_OPTIONS));
      await Promise.resolve();
      await Promise.resolve();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
