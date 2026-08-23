import type { ReaderSessionViewFactory } from './application/readerSessionView';
import type { ReaderHighlightManager } from './services/highlightManager';
import type {
  ReaderSelectionController,
  ReaderSelectionControllerOptions
} from './services/selectionController';
import type { ReaderPanelCoordinator, ReaderPanelCoordinatorOptions } from './panelCoordinator';
import type {
  ReaderEnvironmentController,
  ReaderEnvironmentDependencies,
  ReaderEnvironmentHandlers
} from './environmentController';
import type {
  ReaderSessionLifecycle,
  ReaderSessionLifecycleDependencies,
  ReaderSessionLifecycleHandlers
} from './sessionLifecycle';
import type { ReaderSessionExporter } from './services/exporter';
import type { StorageService } from '../../platform/interfaces/storage';
import type { MessagingService } from '../../platform/interfaces/messaging';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { IReaderRepository } from '../../shared/repositories/IReaderRepository';
import type { ReadingSessionOptions } from '../../shared/types/options';
import type { ReaderMarkdownPayload } from './utils/markdownBuilder';
import type { SupportProgressReporter } from '../runtime/supportProgress';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import type {
  ReaderSessionDraftEnvelope,
  SessionCommentDraftSnapshot,
  SessionDraftStoragePolicy
} from '@shared/sessionDrafts';
import type { SessionDraftLeaseOwnerRegistry } from '../sessionDrafts/sessionDraftLeaseOwnerRegistry';
import type { RuntimeMessageSender } from '@platform/interfaces/runtime';
import type { ReaderHighlightRecord } from './services/highlightManager';

export interface ReaderSessionDraftControllerOptions {
  doc: Document;
  pageUrl: string;
  sendMessage: RuntimeMessageSender;
  retentionPolicy?: SessionDraftStoragePolicy['retentionPolicy'];
  getPageTitle: () => string;
  getHighlights: () => ReaderHighlightRecord[];
  getCommentDrafts: () => SessionCommentDraftSnapshot;
  getDestinationMetadata: () => ExportDestinationMetadata | undefined;
  onPersistenceFailure: () => void;
  leaseOwnerRegistry?: SessionDraftLeaseOwnerRegistry;
  initialClaimedDraft?: ReaderSessionDraftEnvelope;
}

export interface ReaderSessionDraftIdentity {
  draftId: string | null;
  draftCreatedAt: number | null;
  draftStorageKey: string | null;
}

export interface ReaderSessionDependencies {
  viewFactory: ReaderSessionViewFactory;
  optionsRepository: IOptionsRepository;
  storage: StorageService;
  messaging: Pick<MessagingService, 'send'>;
  sessionDraftSender?: RuntimeMessageSender;
  readerRepository: IReaderRepository;
  optionsPageUrl?: string;
  createHighlightManager: (doc: Document) => ReaderHighlightManager;
  createSelectionController: (
    options: ReaderSelectionControllerOptions
  ) => ReaderSelectionController;
  createPanelCoordinator: (options: ReaderPanelCoordinatorOptions) => ReaderPanelCoordinator;
  createEnvironmentController: (
    deps: ReaderEnvironmentDependencies,
    handlers: ReaderEnvironmentHandlers
  ) => ReaderEnvironmentController;
  createLifecycle: (
    deps: ReaderSessionLifecycleDependencies,
    handlers: ReaderSessionLifecycleHandlers
  ) => ReaderSessionLifecycle;
  exporter: ReaderSessionExporter;
  dispatchClipResult: (payload: ReaderMarkdownPayload) => Promise<void>;
  sessionDraftStoragePolicy?: SessionDraftStoragePolicy;
  sessionDraftLeaseOwners?: SessionDraftLeaseOwnerRegistry;
  initialClaimedDraft?: ReaderSessionDraftEnvelope;
  showSupportProgress?: SupportProgressReporter;
}

export const DEFAULT_READING_CONFIG: ReadingSessionOptions = {
  exportMode: 'highlights',
  highlightTheme: 'gradient'
};
