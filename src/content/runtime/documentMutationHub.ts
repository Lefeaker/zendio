import type {
  DocumentMutationDisposer,
  DocumentMutationErrorReporter,
  DocumentMutationHubApi,
  DocumentMutationSubscriptionOptions
} from './documentMutationTypes';

interface PendingDelivery {
  generation: number;
  handle: number;
  records: MutationRecord[];
}

interface SubscriberState {
  active: boolean;
  generation: number;
  options: DocumentMutationSubscriptionOptions;
  pending: Map<string, PendingDelivery>;
}

const hubs = new WeakMap<Document, DocumentMutationHub>();

const defaultErrorReporter: DocumentMutationErrorReporter = (error, context) => {
  console.warn(`[DocumentMutationHub] ${context.phase} failed for ${context.subscriberId}:`, error);
};

function normalizeFailure<Failure>(failure: Failure): Error {
  return failure instanceof Error ? failure : new Error(String(failure));
}

export class DocumentMutationHub implements DocumentMutationHubApi {
  private readonly subscribers = new Set<SubscriberState>();
  private observer: MutationObserver | null = null;
  private observerGeneration = 0;
  private subscriberGeneration = 0;

  constructor(
    private readonly document: Document,
    private readonly reportError: DocumentMutationErrorReporter = defaultErrorReporter
  ) {}

  subscribe(options: DocumentMutationSubscriptionOptions): DocumentMutationDisposer {
    const subscriber: SubscriberState = {
      active: true,
      generation: ++this.subscriberGeneration,
      options,
      pending: new Map()
    };
    this.subscribers.add(subscriber);
    this.connect();

    return () => {
      if (!subscriber.active) return;
      subscriber.active = false;
      this.cancelPending(subscriber);
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) this.disconnect();
    };
  }

  private connect(): void {
    if (this.observer || !this.document.body) return;
    const Observer = this.document.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    if (typeof Observer === 'undefined') return;
    const generation = ++this.observerGeneration;
    this.observer = new Observer((records) => {
      if (generation !== this.observerGeneration) return;
      this.dispatch(records);
    });
    this.observer.observe(this.document.body, { childList: true, subtree: true });
  }

  private disconnect(): void {
    this.observerGeneration += 1;
    this.observer?.disconnect();
    this.observer = null;
  }

  private dispatch(records: MutationRecord[]): void {
    for (const subscriber of [...this.subscribers]) {
      if (!subscriber.active) continue;
      const relevant: MutationRecord[] = [];
      try {
        for (const record of records) {
          if (subscriber.options.filter(record)) relevant.push(record);
        }
      } catch (error) {
        this.report(normalizeFailure(error), subscriber, 'filter');
        continue;
      }
      if (!subscriber.active || relevant.length === 0) continue;
      try {
        const grouped = new Map<string, MutationRecord[]>();
        for (const record of relevant) {
          const configuredKey = subscriber.options.coalescingKey;
          const key =
            typeof configuredKey === 'function'
              ? configuredKey(record)
              : (configuredKey ?? 'default');
          const group = grouped.get(key);
          if (group) group.push(record);
          else grouped.set(key, [record]);
        }
        for (const [key, group] of grouped) this.enqueue(subscriber, key, group);
      } catch (error) {
        this.report(normalizeFailure(error), subscriber, 'filter');
      }
    }
  }

  private enqueue(subscriber: SubscriberState, key: string, records: MutationRecord[]): void {
    const existing = subscriber.pending.get(key);
    if (existing) {
      existing.records.push(...records);
      return;
    }
    const generation = subscriber.generation;
    const handle = this.getView().setTimeout(
      () => {
        const pending = subscriber.pending.get(key);
        subscriber.pending.delete(key);
        if (!pending || !subscriber.active || pending.generation !== subscriber.generation) return;
        try {
          subscriber.options.callback(pending.records);
        } catch (error) {
          this.report(normalizeFailure(error), subscriber, 'callback');
        }
      },
      Math.max(0, subscriber.options.delayMs ?? 0)
    );
    subscriber.pending.set(key, { generation, handle, records: [...records] });
  }

  private cancelPending(subscriber: SubscriberState): void {
    subscriber.generation += 1;
    for (const pending of subscriber.pending.values()) this.getView().clearTimeout(pending.handle);
    subscriber.pending.clear();
  }

  private report(error: Error, subscriber: SubscriberState, phase: 'filter' | 'callback'): void {
    try {
      this.reportError(error, { phase, subscriberId: subscriber.options.subscriberId });
    } catch (reportingError) {
      console.warn('[DocumentMutationHub] Error reporter failed:', reportingError);
    }
  }

  private getView(): Window {
    return this.document.defaultView ?? window;
  }
}

export function acquireDocumentMutationHub(
  document: Document,
  reportError?: DocumentMutationErrorReporter
): DocumentMutationHub {
  const existing = hubs.get(document);
  if (existing) return existing;
  const hub = new DocumentMutationHub(document, reportError);
  hubs.set(document, hub);
  return hub;
}
