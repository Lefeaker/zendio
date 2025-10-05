import { isAIChat } from './detect';
import { extractAIChat } from './extractors/aiChatExtractor';
import { extractArticle } from './extractors/articleExtractor';
import { handleSelectionClip } from './clipper/services/selectionController';
import { SupportPrompt } from './ui/supportPrompt';
import { SHOW_SUPPORT_PROMPT } from '../shared/types';

declare global {
  interface Window {
    __aiobClipperInitialized?: boolean;
  }
}

if (!window.__aiobClipperInitialized) {
  window.__aiobClipperInitialized = true;

  let clipMode: 'full' | 'selection' = 'full';
  const supportPrompt = new SupportPrompt(document);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === SHOW_SUPPORT_PROMPT) {
      supportPrompt.show({
        vaultName: message.vaultName,
        status: message.status,
        errorMessage: message.errorMessage
      });
      return;
    }

    if (message.action === 'clipSelection') {
      clipMode = 'selection';
      void handleClip();
      sendResponse({ success: true });
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

  async function handleClip() {
    try {
      const url = location.href;
      const doc = document;
      let result: any;

      if (clipMode === 'selection') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          throw new Error('No text selected');
        }

        const clip = await handleSelectionClip(doc, url, selection);
        clipMode = 'full';
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
}
