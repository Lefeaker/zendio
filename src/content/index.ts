import { isAIChat } from './detect';
import { extractAIChat } from './adapters/chat';
import { extractArticle } from './adapters/article';
import { extractClipperContent } from './adapters/clipper';
import { ClipperDialog } from './clipper-dialog';

// Store the clip mode: 'full' or 'selection'
let clipMode: 'full' | 'selection' = 'full';

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'clipSelection') {
    clipMode = 'selection';
    handleClip();
    sendResponse({ success: true });
    return true;
  }
});

async function handleClip() {
  try {
    console.log('Content script started, mode:', clipMode);
    const url = location.href;
    const doc = document;

    let result;

    if (clipMode === 'selection') {
      // Handle selection clipping
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        throw new Error('No text selected');
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        throw new Error('Selected text is empty');
      }

      // Get the HTML of the selection and save the range BEFORE showing dialog
      const range = selection.getRangeAt(0);
      const savedRange = range.cloneRange(); // Clone the range to preserve it

      const container = document.createElement('div');
      container.appendChild(range.cloneContents());
      const selectedHtml = container.innerHTML;

      console.log('Selected text length:', selectedText.length);
      console.log('Selected HTML length:', selectedHtml.length);

      // Show dialog to get user comment
      const dialog = new ClipperDialog();
      const dialogResult = await dialog.show(selectedText);

      if (!dialogResult.confirmed) {
        console.log('User cancelled clipping');
        return;
      }

      // Get fragment clipper config from storage
      const { options } = await chrome.storage.sync.get('options');
      const fragmentConfig = options?.fragmentClipper || {
        useFootnoteFormat: true,
        captureContext: false,
        contextLength: 200,
        contextMode: 'chars'
      };

      // Extract clipper content with user comment, config, and saved range
      result = await extractClipperContent(
        doc,
        url,
        selectedHtml,
        selectedText,
        dialogResult.comment,
        fragmentConfig,
        savedRange  // Pass the saved range for context extraction
      );

      // Reset clip mode
      clipMode = 'full';
    } else {
      // Handle full page clipping (original behavior)
      console.log('Detecting page type...');
      const isChat = isAIChat(url, doc);
      console.log('Is AI chat:', isChat);

      result = isChat
        ? await extractAIChat(doc, url)
        : await extractArticle(doc, url);
    }

    console.log('Extraction result:', result);

    if (!result || !result.markdown) {
      throw new Error('Extraction failed: no markdown content');
    }

    chrome.runtime.sendMessage({ type: 'CLIP_RESULT', payload: result });
    console.log('Message sent to background');
  } catch (error) {
    console.error('Content script error:', error);
    chrome.runtime.sendMessage({
      type: 'CLIP_ERROR',
      error: (error as Error).message || String(error)
    });
  }
}

// Auto-run for full page clip (original behavior)
handleClip();