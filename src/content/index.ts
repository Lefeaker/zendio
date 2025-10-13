import { isAIChat } from './detect';
import { extractAIChat } from './extractors/aiChatExtractor';
import { extractArticle } from './extractors/articleExtractor';
import { createSelectionController } from './clipper/services/selectionController';
import { createClipperDialogPromptGateway } from './clipper/presentation/clipperDialogPrompt';
import { VideoSession } from './video/session';
import { ReaderSession } from './reader/session';
import { SupportPrompt } from './ui/supportPrompt';
import { SHOW_SUPPORT_PROMPT } from '../shared/types';
import {
  DEFAULT_FRAGMENT_CONFIG,
  createModifierState,
  loadFragmentConfig,
  resetModifierState,
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from './clipper/services/fragmentConfig';
import { initVideoPrompt } from './video/prompt';

declare global {
  interface Window {
    __aiobClipperInitialized?: boolean;
    __aiobVideoActive?: boolean;
    __aiobVideoController?: VideoSession;
    __aiobReaderActive?: boolean;
  }
}

if (!window.__aiobClipperInitialized) {
  window.__aiobClipperInitialized = true;

  let clipMode: 'full' | 'selection' = 'full';
  const supportPrompt = new SupportPrompt(document);
  let activeVideoSession: VideoSession | null = null;
  let fragmentClipperConfig = DEFAULT_FRAGMENT_CONFIG;
  let autoSelectionInFlight = false;
  const modifierState = createModifierState();
  let selectionModifierActive = false;
  type SelectionSnapshot = {
    range: Range;
    root: DocumentOrShadowRoot;
  };
  const BILIBILI_SHADOW_HOST_SELECTORS = [
    'bili-comment-thread-renderer',
    'bili-comment-renderer',
    'bili-comment-reply-renderer',
    'bili-rich-text'
  ] as const;
  let lastSelectionSnapshot: SelectionSnapshot | null = null;
  const clipPromptGateway = createClipperDialogPromptGateway();
  const { handleSelectionClip, handleVideoSelectionClip, handleVideoSelectionClipFromData } = createSelectionController({
    prompt: clipPromptGateway,
    createReaderSession: (doc, url) => new ReaderSession(doc, url, clipPromptGateway),
    createVideoSession: (doc) => new VideoSession(doc)
  });

  void refreshFragmentConfig();
  void initVideoPrompt();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === SHOW_SUPPORT_PROMPT) {
      supportPrompt.show({
        vaultName: message.vaultName,
        status: message.status,
        errorMessage: message.errorMessage
      });
      return;
    }

    if (message.action === 'startVideoMode') {
      if (window.__aiobVideoActive && window.__aiobVideoController) {
        sendResponse({ success: true, alreadyActive: true });
        return true;
      }

      const session = new VideoSession(document);
      activeVideoSession = session;
      session.start()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error: unknown) => {
          if (activeVideoSession === session) {
            activeVideoSession = null;
          }
          console.error('[content] Failed to start video mode:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          sendResponse({ success: false, error: messageText });
        });
      return true;
    }

    if (message.action === 'clipSelection') {
      clipMode = 'selection';
      void handleClip();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'videoClipSelection') {
      if (window !== window.top && typeof message.frameId === 'number') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          sendResponse({ success: false, error: 'No text selected' });
          return true;
        }

        const range = selection.getRangeAt(0).cloneRange();
        const container = document.createElement('div');
        container.appendChild(range.cloneContents());
        const selectedHtml = container.innerHTML;
        const selectedText = selection.toString();

        chrome.runtime.sendMessage({
          type: 'AIIOB_FORWARD_VIDEO_SELECTION',
          payload: {
            selectedHtml,
            selectedText,
            sourceUrl: location.href
          }
        }, () => {
          void chrome.runtime?.lastError;
        });

        selection.removeAllRanges();
        sendResponse({ success: true, forwarded: true });
        return true;
      }

      let selectionInfo = resolveActiveSelection();
      if ((!selectionInfo || selectionInfo.selection.rangeCount === 0 || selectionInfo.selection.isCollapsed) && lastSelectionSnapshot) {
        selectionInfo = restoreSelectionFromSnapshot(lastSelectionSnapshot);
      }
      if (!selectionInfo || selectionInfo.selection.rangeCount === 0 || selectionInfo.selection.isCollapsed) {
        sendResponse({ success: false, error: 'No text selected' });
        return true;
      }
      handleVideoSelectionClip(document, location.href, selectionInfo.selection)
        .then(() => {
          lastSelectionSnapshot = null;
          sendResponse({ success: true });
        })
        .catch((error: unknown) => {
          console.error('[content] Video selection clip failed:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          sendResponse({ success: false, error: messageText });
        });
      return true;
    }

    if (message.action === 'videoClipSelectionFromFrame') {
      const payload = message.payload ?? {};
      const selectedHtml = typeof payload.selectedHtml === 'string' ? payload.selectedHtml : '';
      const selectedText = typeof payload.selectedText === 'string' ? payload.selectedText : '';
      handleVideoSelectionClipFromData(document, location.href, selectedHtml, selectedText)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error: unknown) => {
          console.error('[content] Remote video selection clip failed:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          sendResponse({ success: false, error: messageText });
        });
      return true;
    }

    if (message.action === 'clipFull') {
      if (window !== window.top) {
        sendResponse({ success: false, ignored: true });
        return true;
      }
      clipMode = 'full';
      void handleClip();
      sendResponse({ success: true });
      return true;
    }
  });

  if (chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }
      if (changes.options) {
        void refreshFragmentConfig();
      }
    });
  }

  const handleModifierKey = (event: KeyboardEvent): void => {
    syncModifierState(modifierState, event);
  };

  const handleWindowBlur = (): void => {
    resetModifierState(modifierState);
    selectionModifierActive = false;
    lastSelectionSnapshot = null;
  };

  const handlePrimaryMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      selectionModifierActive = false;
      return;
    }
    syncModifierState(modifierState, event);
    if (!fragmentClipperConfig.selectionModifierEnabled) {
      selectionModifierActive = false;
      return;
    }
    selectionModifierActive = shouldTriggerSelectionWithModifiers(fragmentClipperConfig, modifierState);
  };

  document.addEventListener('keydown', handleModifierKey, true);
  document.addEventListener('keyup', handleModifierKey, true);
  window.addEventListener('blur', handleWindowBlur, true);
  document.addEventListener('mousedown', handlePrimaryMouseDown, true);
  document.addEventListener('mouseup', handleAutoSelectionClip, true);
  document.addEventListener('selectionchange', handleSelectionChange, true);
  document.addEventListener('selectstart', handleSelectStart, true);

  async function handleClip() {
    try {
      const url = location.href;
      const doc = document;
      let result: any;

      if (clipMode === 'selection') {
        let selectionInfo = resolveActiveSelection();
        if ((!selectionInfo || selectionInfo.selection.rangeCount === 0 || selectionInfo.selection.isCollapsed) && lastSelectionSnapshot) {
          selectionInfo = restoreSelectionFromSnapshot(lastSelectionSnapshot);
        }

        if (!selectionInfo || selectionInfo.selection.rangeCount === 0 || selectionInfo.selection.isCollapsed) {
          throw new Error('No text selected');
        }

        const selection = selectionInfo.selection;

        if (window.__aiobVideoActive || window.__aiobVideoController) {
          await handleVideoSelectionClip(doc, url, selection);
          clipMode = 'full';
          lastSelectionSnapshot = null;
          return;
        }

        const clip = await handleSelectionClip(doc, url, selection);
        clipMode = 'full';
        lastSelectionSnapshot = null;
        if (!clip) {
          return;
        }
        result = clip;
      } else {
        const detectedChat = isAIChat(url, doc);
        result = detectedChat
          ? await extractAIChat(doc, url)
          : await extractArticle(doc, url);
      }

      if (!result || !result.markdown) {
        throw new Error('Extraction failed: no markdown content');
      }

      chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload: result });
    } catch (error) {
      console.error('Content script error:', error);
      chrome.runtime.sendMessage({
        type: 'CLIP_ERROR',
        error: (error as Error).message || String(error)
      });
    }
  }

  function handleAutoSelectionClip(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (window.__aiobReaderActive) {
      return;
    }
    syncModifierState(modifierState, event);
    const modifierRequired = fragmentClipperConfig.selectionModifierEnabled;
    const modifiersSatisfied = selectionModifierActive
      || shouldTriggerSelectionWithModifiers(fragmentClipperConfig, modifierState);
    if (modifierRequired && !modifiersSatisfied) {
      selectionModifierActive = false;
      return;
    }

    const selectionInfo = resolveActiveSelection();
    if (!selectionInfo) {
      selectionModifierActive = false;
      return;
    }

    const selection = selectionInfo.selection;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      selectionModifierActive = false;
      return;
    }
    if (!selection.toString().trim()) {
      selectionModifierActive = false;
      return;
    }
    if (isSelectionInsideUi(selection) || isSelectionEditable(selection)) {
      selectionModifierActive = false;
      return;
    }
    if (autoSelectionInFlight) {
      return;
    }

    autoSelectionInFlight = true;
    clipMode = 'selection';
    void handleClip().finally(() => {
      autoSelectionInFlight = false;
      selectionModifierActive = false;
    });
  }

  function handleSelectionChange(): void {
    const active = findActiveSelection();
    if (!active) {
      lastSelectionSnapshot = null;
      return;
    }
    if (isSelectionInsideUi(active.selection) || isSelectionEditable(active.selection)) {
      return;
    }
    const snapshot = captureSelectionSnapshot(active);
    if (snapshot) {
      lastSelectionSnapshot = snapshot;
    }
  }

  function isSelectionInsideUi(selection: Selection): boolean {
    const nodes = [selection.anchorNode, selection.focusNode];
    return nodes.some((node) => {
      let element: Element | null = null;
      if (node instanceof Element) {
        element = node;
      } else if (node instanceof Text) {
        element = node.parentElement;
      }
      while (element) {
        if (element.id === 'obsidian-clipper-dialog' || element.id === 'aiob-reader-panel') {
          return true;
        }
        element = element.parentElement;
      }
      return false;
    });
  }

  function isSelectionEditable(selection: Selection): boolean {
    const nodes = [selection.anchorNode, selection.focusNode];
    return nodes.some((node) => {
      let element: Element | null = null;
      if (node instanceof Element) {
        element = node;
      } else if (node instanceof Text) {
        element = node.parentElement;
      }
      if (!element) {
        return false;
      }
      return Boolean(element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=true]'));
    });
  }

  function handleSelectStart(_event: Event): void {
    const snapshot = captureSelectionSnapshot();
    if (snapshot) {
      lastSelectionSnapshot = snapshot;
    }
  }

  function resolveActiveSelection(): { selection: Selection; root: DocumentOrShadowRoot } | null {
    const active = findActiveSelection();
    if (!active) {
      return null;
    }
    const snapshot = captureSelectionSnapshot(active);
    if (snapshot) {
      lastSelectionSnapshot = snapshot;
    }
    return active;
  }

  function restoreSelectionFromSnapshot(snapshot: SelectionSnapshot | null): { selection: Selection; root: DocumentOrShadowRoot } | null {
    if (!snapshot) {
      return null;
    }
    const selection = getSelectionFromRoot(snapshot.root);
    if (!selection) {
      return null;
    }
    try {
      selection.removeAllRanges();
      selection.addRange(snapshot.range.cloneRange());
      return { selection, root: snapshot.root };
    } catch {
      return null;
    }
  }

  function captureSelectionSnapshot(
    activeSelection?: { selection: Selection; root: DocumentOrShadowRoot } | null
  ): SelectionSnapshot | null {
    const active = activeSelection ?? findActiveSelection();
    if (!active) {
      return null;
    }
    const { selection, root } = active;
    if (selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }
    try {
      const range = selection.getRangeAt(0).cloneRange();
      return { range, root };
    } catch {
      return null;
    }
  }

  async function refreshFragmentConfig(): Promise<void> {
    try {
      fragmentClipperConfig = await loadFragmentConfig();
    } catch (error) {
      console.warn('[content] Failed to refresh fragment clipper config:', error);
      fragmentClipperConfig = DEFAULT_FRAGMENT_CONFIG;
    }
    if (!fragmentClipperConfig.selectionModifierEnabled) {
      selectionModifierActive = false;
      resetModifierState(modifierState);
    }
  }

  function findActiveSelection(): { selection: Selection; root: DocumentOrShadowRoot } | null {
    const docSelection = getDocumentSelection();
    if (docSelection) {
      return { selection: docSelection, root: document };
    }
    const shadowSelection = findShadowSelection();
    if (shadowSelection) {
      return shadowSelection;
    }
    return null;
  }

  function findShadowSelection(): { selection: Selection; root: ShadowRoot } | null {
    const visited = new Set<ShadowRoot>();
    const queue = collectInitialShadowRoots();

    while (queue.length) {
      const root = queue.pop();
      if (!root || visited.has(root)) {
        continue;
      }
      visited.add(root);

      const selection = getSelectionFromRoot(root);
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        return { selection, root };
      }

      collectChildShadowRoots(root, queue);
    }

    return null;
  }

  function collectInitialShadowRoots(): ShadowRoot[] {
    const roots: ShadowRoot[] = [];
    BILIBILI_SHADOW_HOST_SELECTORS.forEach((selector) => {
      const hosts = Array.from(document.querySelectorAll<HTMLElement>(selector));
      hosts.forEach((host) => {
        if (host.shadowRoot) {
          roots.push(host.shadowRoot);
        }
      });
    });
    return roots;
  }

  function collectChildShadowRoots(root: ShadowRoot, queue: ShadowRoot[]): void {
    const elements = Array.from(root.querySelectorAll<HTMLElement>('*'));
    elements.forEach((element) => {
      if (element.shadowRoot) {
        queue.push(element.shadowRoot);
      }
    });
  }

  function getSelectionFromRoot(root: DocumentOrShadowRoot): Selection | null {
    if (root instanceof Document) {
      return getDocumentSelection();
    }
    if (root instanceof ShadowRoot) {
      const shadowWithSelection = root as ShadowRoot & { getSelection?: () => Selection | null };
      const selection = typeof shadowWithSelection.getSelection === 'function'
        ? shadowWithSelection.getSelection()
        : null;
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        return selection;
      }
    }
    return null;
  }

  function getDocumentSelection(): Selection | null {
    const docSelection = typeof document.getSelection === 'function' ? document.getSelection() : null;
    if (docSelection && docSelection.rangeCount > 0 && !docSelection.isCollapsed) {
      return docSelection;
    }
    if (typeof window.getSelection === 'function') {
      const winSelection = window.getSelection();
      if (winSelection && winSelection.rangeCount > 0 && !winSelection.isCollapsed) {
        return winSelection;
      }
    }
    return null;
  }
}
