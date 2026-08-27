import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { VideoPlatformContext } from '@content/video/platforms';
import type {
  DocumentMutationSubscriptionOptions,
  ScopedMutationObserver
} from '@content/runtime/documentMutationTypes';

export interface ScopedObserverMock extends ScopedMutationObserver {
  callback: MutationCallback;
  observe: Mock<(...args: [Node, MutationObserverInit?]) => void>;
  disconnect: Mock<() => void>;
}

export interface VideoPlatformContextMocks {
  highlightSelection: Mock<(...args: [Range, string, string]) => string | undefined>;
  decorateHighlight: Mock<(...args: [HTMLElement]) => void>;
  scheduleFragmentHighlightRestore: Mock<(...args: []) => void>;
  getElementByIdDeep: Mock<(...args: [string]) => HTMLElement | null>;
  querySelectorDeep: Mock<(...args: [string]) => Element | null>;
  subscribeDocumentMutations: Mock<(options: DocumentMutationSubscriptionOptions) => () => void>;
  emitDocumentMutations(records: MutationRecord[]): void;
  emitScopedMutations(records: MutationRecord[]): void;
  scopedObservers: ScopedObserverMock[];
  observeWithFragmentObserver: Mock<
    (...args: [ScopedMutationObserver, Node, MutationObserverInit]) => void
  >;
  registerShadowSelectionBridge: Mock<(...args: [ShadowRoot]) => void>;
  ensureHighlightStyles: Mock<(...args: [ShadowRoot]) => void>;
}

export type VideoPlatformContextWithMocks = VideoPlatformContext & {
  __mocks: VideoPlatformContextMocks;
};

export function createContext(doc: Document): VideoPlatformContextWithMocks {
  const subscriptions = new Set<{
    active: boolean;
    handle: number | null;
    options: DocumentMutationSubscriptionOptions;
    records: MutationRecord[];
  }>();
  const scopedObservers: ScopedObserverMock[] = [];
  const subscribeDocumentMutations = vi.fn(
    (options: DocumentMutationSubscriptionOptions): (() => void) => {
      const subscription = { active: true, handle: null, options, records: [] as MutationRecord[] };
      subscriptions.add(subscription);
      return () => {
        if (!subscription.active) return;
        subscription.active = false;
        if (subscription.handle !== null) window.clearTimeout(subscription.handle);
        subscriptions.delete(subscription);
      };
    }
  );
  const emitDocumentMutations = (records: MutationRecord[]): void => {
    for (const subscription of subscriptions) {
      const relevant = records.filter((record) => subscription.options.filter(record));
      if (relevant.length === 0) continue;
      subscription.records.push(...relevant);
      if (subscription.handle !== null) continue;
      subscription.handle = window.setTimeout(() => {
        subscription.handle = null;
        const pending = subscription.records.splice(0);
        if (subscription.active) subscription.options.callback(pending);
      }, subscription.options.delayMs ?? 0);
    }
  };
  const createScopedMutationObserver = vi.fn((callback: MutationCallback) => {
    const observer: ScopedObserverMock = {
      callback,
      observe: vi.fn(),
      disconnect: vi.fn()
    };
    scopedObservers.push(observer);
    return observer;
  });
  const mocks: VideoPlatformContextMocks = {
    highlightSelection: vi.fn<(...args: [Range, string, string]) => string | undefined>(
      () => 'wrapper-1'
    ),
    decorateHighlight: vi.fn<(...args: [HTMLElement]) => void>(),
    scheduleFragmentHighlightRestore: vi.fn<(...args: []) => void>(),
    getElementByIdDeep: vi.fn<(...args: [string]) => HTMLElement | null>(() => null),
    querySelectorDeep: vi.fn<(...args: [string]) => Element | null>(() => null),
    subscribeDocumentMutations,
    emitDocumentMutations,
    emitScopedMutations: (records) => {
      const observer = scopedObservers.at(-1);
      observer?.callback(records, observer as unknown as MutationObserver);
    },
    scopedObservers,
    observeWithFragmentObserver: vi.fn((observer, target, options) =>
      observer.observe(target, options)
    ),
    registerShadowSelectionBridge: vi.fn<(...args: [ShadowRoot]) => void>(),
    ensureHighlightStyles: vi.fn<(...args: [ShadowRoot]) => void>()
  };

  return {
    doc,
    documentMutationHub: { subscribe: subscribeDocumentMutations },
    createScopedMutationObserver,
    ...mocks,
    querySelectorDeep: <T extends Element>(selector: string): T | null =>
      mocks.querySelectorDeep(selector) as T | null,
    __mocks: mocks
  };
}

export function withScheduledRestore(
  context: VideoPlatformContextWithMocks,
  scheduleRestore: VideoPlatformContextMocks['scheduleFragmentHighlightRestore']
): VideoPlatformContextWithMocks {
  context.scheduleFragmentHighlightRestore = scheduleRestore;
  context.__mocks.scheduleFragmentHighlightRestore = scheduleRestore;
  return context;
}

export function mountBiliCommentsFixture(): {
  commentsHost: HTMLElement;
  root: ShadowRoot;
  thread: HTMLElement;
  comment: HTMLElement;
  richText: HTMLElement;
  content: HTMLElement;
} {
  const host = document.createElement('bili-comments');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const contents = document.createElement('div');
  contents.id = 'contents';
  const thread = document.createElement('bili-comment-thread-renderer');
  const threadRoot = thread.attachShadow({ mode: 'open' });
  const comment = document.createElement('bili-comment-renderer');
  const commentRoot = comment.attachShadow({ mode: 'open' });
  const richText = document.createElement('bili-rich-text');
  const richTextRoot = richText.attachShadow({ mode: 'open' });
  const content = document.createElement('p');
  content.id = 'contents';
  content.innerHTML = '<span>fixture comment</span>';
  richTextRoot.append(content);
  commentRoot.append(richText);
  threadRoot.append(comment);
  contents.append(thread);
  root.append(contents);
  return { commentsHost: host, root, thread, comment, richText, content };
}

export function createBilibiliRichTextHost(html: string): HTMLElement {
  const host = document.createElement('bili-rich-text');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<p id="contents">${html}</p>`;
  return host;
}

export function mountBiliCommentWithRichText(html: string): {
  commentsHost: HTMLElement;
  richText: HTMLElement;
  content: HTMLElement;
} {
  const commentsHost = document.createElement('bili-comments');
  const commentsRoot = commentsHost.attachShadow({ mode: 'open' });
  const thread = document.createElement('bili-comment-thread-renderer');
  const threadRoot = thread.attachShadow({ mode: 'open' });
  const comment = document.createElement('bili-comment-renderer');
  const commentRoot = comment.attachShadow({ mode: 'open' });
  const richText = createBilibiliRichTextHost(html);
  const content = richText.shadowRoot?.querySelector<HTMLElement>('#contents');
  if (!content) {
    throw new Error('Failed to create Bilibili rich text fixture content');
  }

  commentRoot.append(richText);
  threadRoot.append(comment);
  commentsRoot.append(thread);
  document.body.append(commentsHost);

  return { commentsHost, richText, content };
}
