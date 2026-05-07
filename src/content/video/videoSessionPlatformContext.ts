import type { VideoPlatformContext } from './platforms';
import type { FragmentHighlighter } from './fragmentHighlighter';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { ShadowSelectionBridge } from './shadowSelectionBridge';

export function createVideoSessionPlatformContext(args: {
  doc: Document;
  fragmentHighlighter: FragmentHighlighter;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  shadowSelectionBridge: ShadowSelectionBridge;
}): VideoPlatformContext {
  const { doc, fragmentHighlighter, fragmentHighlightCoordinator, shadowSelectionBridge } = args;
  return {
    doc,
    highlightSelection: (range, captureId, fragmentUrl) =>
      fragmentHighlighter.highlightRange(range, captureId, fragmentUrl),
    decorateHighlight: (element) => fragmentHighlighter.decorateElement(element),
    scheduleFragmentHighlightRestore: () => fragmentHighlightCoordinator.scheduleRestore(),
    getElementByIdDeep: (id) => fragmentHighlighter.getElementByIdDeep(id),
    querySelectorDeep: (selector) => fragmentHighlighter.querySelectorDeep(selector),
    observeWithFragmentObserver: (target, options) => {
      fragmentHighlightCoordinator.ensureStartedForFragments();
      fragmentHighlightCoordinator.observeWithCoordinator(target, options);
    },
    registerShadowSelectionBridge: (root) => shadowSelectionBridge.register(root),
    ensureHighlightStyles: (root) => fragmentHighlighter.ensureHighlightStyles(root)
  };
}
