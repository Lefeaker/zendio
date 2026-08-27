import type { VideoPlatformContext } from './platforms';
import type { FragmentHighlighter } from './fragmentHighlighter';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { ShadowSelectionBridge } from './shadowSelectionBridge';
import type { DocumentMutationHubApi } from '../runtime/documentMutationTypes';

export function createVideoSessionPlatformContext(args: {
  doc: Document;
  fragmentHighlighter: FragmentHighlighter;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  shadowSelectionBridge: ShadowSelectionBridge;
  documentMutationHub: DocumentMutationHubApi;
}): VideoPlatformContext {
  const {
    doc,
    fragmentHighlighter,
    fragmentHighlightCoordinator,
    shadowSelectionBridge,
    documentMutationHub
  } = args;
  return {
    doc,
    documentMutationHub,
    highlightSelection: (range, captureId, fragmentUrl) =>
      fragmentHighlighter.highlightRange(range, captureId, fragmentUrl),
    decorateHighlight: (element) => fragmentHighlighter.decorateElement(element),
    scheduleFragmentHighlightRestore: () => fragmentHighlightCoordinator.scheduleRestore(),
    getElementByIdDeep: (id) => fragmentHighlighter.getElementByIdDeep(id),
    querySelectorDeep: (selector) => fragmentHighlighter.querySelectorDeep(selector),
    createScopedMutationObserver: (callback) => {
      const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
      return typeof Observer === 'undefined' ? null : new Observer(callback);
    },
    observeWithFragmentObserver: (observer, target, options) => observer.observe(target, options),
    registerShadowSelectionBridge: (root) => shadowSelectionBridge.register(root),
    ensureHighlightStyles: (root) => fragmentHighlighter.ensureHighlightStyles(root)
  };
}
