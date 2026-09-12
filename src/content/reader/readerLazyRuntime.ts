import type { MessagingService } from '../../platform/interfaces/messaging';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { StorageService } from '../../platform/interfaces/storage';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import type { ReaderSessionAdapter } from '../clipper/services/selectionController';
import type { SupportProgressReporter } from '../runtime/supportProgress';
import type { ReaderSessionDraftEnvelope, SessionDraftStoragePolicy } from '@shared/sessionDrafts';
import type { SessionDraftLeaseOwnerRegistry } from '../sessionDrafts/sessionDraftLeaseOwnerRegistry';
import { ReaderSession } from './session';
import { createReaderSessionDependencies } from './sessionDependencies';

export interface ReaderLazyRuntimeDependencies {
  optionsRepository: IOptionsRepository;
  storage: StorageService;
  messaging: Pick<MessagingService, 'send'>;
  runtime: Pick<RuntimeService, 'getURL'>;
  promptGateway: ClipPromptGateway;
  sessionDraftStoragePolicy?: SessionDraftStoragePolicy;
  sessionDraftLeaseOwners?: SessionDraftLeaseOwnerRegistry;
  showSupportProgress?: SupportProgressReporter;
}

export function createReaderSessionAdapter(
  doc: Document,
  url: string,
  dependencies: ReaderLazyRuntimeDependencies,
  initialClaimedDraft?: ReaderSessionDraftEnvelope,
  onInitialDraftAdopted?: () => void
): ReaderSessionAdapter {
  let sessionPromise: Promise<ReaderSessionAdapter> | null = null;

  const getSession = async (): Promise<ReaderSessionAdapter> => {
    if (!sessionPromise) {
      sessionPromise = Promise.resolve().then(() => {
        const readerDependencies = createReaderSessionDependencies({
          optionsRepository: dependencies.optionsRepository,
          storage: dependencies.storage,
          messaging: dependencies.messaging,
          runtime: dependencies.runtime,
          ...(dependencies.sessionDraftStoragePolicy
            ? { sessionDraftStoragePolicy: dependencies.sessionDraftStoragePolicy }
            : {}),
          ...(dependencies.sessionDraftLeaseOwners
            ? { sessionDraftLeaseOwners: dependencies.sessionDraftLeaseOwners }
            : {}),
          ...(initialClaimedDraft ? { initialClaimedDraft } : {}),
          ...(dependencies.showSupportProgress
            ? { showSupportProgress: dependencies.showSupportProgress }
            : {})
        });
        const session = new ReaderSession(doc, url, dependencies.promptGateway, readerDependencies);
        onInitialDraftAdopted?.();
        return session;
      });
    }
    return sessionPromise;
  };

  return {
    async start(initialHighlight) {
      const session = await getSession();
      await session.start(initialHighlight);
    },
    ingestExternalHighlight(range, selectedHtml, selectedText, comment) {
      void getSession().then((session) => {
        session.ingestExternalHighlight(range, selectedHtml, selectedText, comment);
      });
    }
  };
}
