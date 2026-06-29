import { VIDEO_MODE_PANEL_ICON_PATH } from '@shared/assets/iconPaths';
import { message } from '../previewNavigation';
import type { PreviewContent } from '../types';

const SAMPLE_RESEARCH_VAULT = message('schemaPreviewSampleVaultResearch');
const SAMPLE_VIDEO_VAULT = message('schemaPreviewSampleVaultVideo');
const SAMPLE_ARTICLE_TITLE = message('schemaPreviewClipperSourceArticleTitle');
const SAMPLE_VIDEO_CAPTURE_QUOTE = message('schemaPreviewVideoCaptureTwoSummary');

export const runtimeSurfacesContent: PreviewContent['surfaces'] = {
  clipper: {
    hero: {
      title: message('schemaRuntimeClipperTitle'),
      description: message('schemaRuntimeClipperDescription'),
      pills: ['Clip Selection', 'Reader Entry', 'Video Entry', 'Shortcuts'],
      icon: 'content_cut'
    },
    iconUrl: '../../AiiinOB/public/icons/60x60/zendio_icon_clipt.png',
    labels: {
      title: message('clipDialogTitle'),
      selectionPreview: 'Selection Preview',
      commentLabel: 'Comment'
    },
    source: {
      title: SAMPLE_ARTICLE_TITLE,
      host: 'macworld.com/article/2024-macos-update',
      initials: 'MW',
      verifiedLabel: 'Verified source'
    },
    destination: {
      id: 'vault-research',
      kind: 'vault',
      label: SAMPLE_RESEARCH_VAULT,
      path: 'Clippings/macOS update preview article.md',
      hasConfiguredVault: true,
      options: [
        {
          id: 'vault-research',
          kind: 'vault',
          label: SAMPLE_RESEARCH_VAULT,
          path: 'Clippings/macOS update preview article.md',
          selected: true
        },
        {
          id: 'downloads',
          kind: 'downloads',
          label: 'Downloads',
          path: 'Clippings/macOS update preview article.md',
          selected: false
        }
      ]
    },
    selectedText:
      'What matters most is not the information itself, but the links between that information and what you already know. Only when those links are written down can your future self re-enter the original train of thought.',
    commentPlaceholder: 'Write down your interpretation, question, or follow-up...',
    helper:
      'Double Enter opens Reader Mode, Cmd/Ctrl + Enter saves immediately, Esc cancels, and Alt + arrow keys move the dialog.',
    shortcuts: [
      'Double ↵ to open Reader Mode',
      'Cmd/Ctrl + ↵ to save immediately',
      'Esc to cancel',
      'Alt + arrow keys to move the dialog'
    ],
    actions: [
      { id: 'reader', label: message('addToReaderButton'), variant: 'ghost' },
      { id: 'video', label: message('openVideoModeButton'), variant: 'ghost' },
      { id: 'clip', label: message('clipButton'), variant: 'primary' }
    ]
  },
  reader: {
    hero: {
      title: message('schemaRuntimeReaderTitle'),
      description: message('schemaRuntimeReaderDescription'),
      pills: ['Non-modal Panel', 'Highlight List', 'Inline Comment Edit', 'AI Summary Slot'],
      icon: 'auto_stories'
    },
    iconUrl: '../../AiiinOB/public/icons/60x60/zendio_icon_readingt.png',
    labels: {
      title: message('schemaRuntimeReaderTitle'),
      subtitle: message('readerPanelStatus'),
      exitTriggerLabel: 'Exit',
      exitTitle: 'Leave this panel?',
      exitCancelLabel: 'Keep editing',
      exitConfirmLabel: 'Confirm exit',
      notePlaceholder: 'Add your takeaway for this highlight...',
      saveLabel: 'Save',
      deleteLabel: 'Delete'
    },
    hint: message('readerPanelHint'),
    counter: '4',
    destination: {
      id: 'vault-research',
      kind: 'vault',
      label: SAMPLE_RESEARCH_VAULT,
      path: 'Reading/macOS update preview article.md',
      hasConfiguredVault: true,
      options: [
        {
          id: 'vault-research',
          kind: 'vault',
          label: SAMPLE_RESEARCH_VAULT,
          path: 'Reading/macOS update preview article.md',
          selected: true
        },
        {
          id: 'downloads',
          kind: 'downloads',
          label: 'Downloads',
          path: 'Reading/macOS update preview article.md',
          selected: false
        }
      ]
    },
    overlaySummary:
      'AI summary: This article focuses on how information links become reusable knowledge over time, emphasizing that highlights alone matter less than the context and judgment you add around them.',
    highlights: [
      {
        id: 'reader-1',
        index: 1,
        excerpt:
          'What matters most is not the information itself, but the links between that information and what you already know.',
        fullText:
          'What matters most is not the information itself, but the links between that information and what you already know. Without those links, a saved excerpt often turns into a beautiful sentence with no remaining context.',
        commentPreview:
          'This works well near the top of the article as the lead note for the Reader Mode export.',
        comment:
          'This works well near the top of the article as the lead note for the Reader Mode export.',
        timestamp: 'Today 21:14'
      },
      {
        id: 'reader-2',
        index: 2,
        excerpt:
          'The value of information is not that it was stored, but that it can be understood again in the future.',
        fullText:
          'The value of information is not that it was stored, but that it can be understood again in the future. Re-understanding depends on the original context, your note, and the nearby nodes in your knowledge graph.',
        commentPreview: 'Add an example here to explain why saving a link alone is not enough.',
        comment: 'Add an example here to explain why saving a link alone is not enough.',
        timestamp: 'Today 21:18'
      },
      {
        id: 'reader-3',
        index: 3,
        excerpt:
          'A highlight is only an anchor; what really helps memory is the judgment you write beside it.',
        fullText:
          'A highlight is only an anchor; what really helps memory is the judgment you write beside it. The value of Reader Mode is turning that step from a mental action into structured output.',
        commentPreview: 'Click to enter inline editing.',
        draft:
          'Add a sentence here explaining why the judgment belongs in Reader Mode instead of waiting until later in Obsidian.',
        timestamp: 'Today 21:26',
        editing: true
      }
    ],
    actions: [
      { id: 'reader:finish', label: message('readerPanelFinish'), variant: 'primary' },
      { id: 'reader:cancel', label: 'Cancel', variant: 'ghost' }
    ]
  },
  video: {
    hero: {
      title: message('schemaRuntimeVideoTitle'),
      description: message('schemaRuntimeVideoDescription'),
      pills: ['Timestamp Notes', 'Fragment Capture', 'Inline Edit', 'YouTube / Bilibili'],
      icon: 'smart_display'
    },
    iconUrl: `../../AiiinOB/public/${VIDEO_MODE_PANEL_ICON_PATH}`,
    labels: {
      title: message('schemaRuntimeVideoTitle'),
      subtitle: message('videoPanelStatus'),
      exitTriggerLabel: 'Exit',
      exitTitle: 'Leave this panel?',
      exitCancelLabel: 'Keep editing',
      exitConfirmLabel: 'Confirm exit',
      notePlaceholder: 'Add context for this timestamp or subtitle fragment...',
      saveLabel: 'Save',
      deleteLabel: 'Delete',
      addLabel: 'Note current timestamp',
      emptyCapturePlaceholder: 'Write a note for the current timestamp...'
    },
    status: 'YouTube · 01:23:14 · Following current playback time',
    hint: message('videoPanelHint'),
    counter: '3',
    destination: {
      id: 'vault-video',
      kind: 'vault',
      label: SAMPLE_VIDEO_VAULT,
      path: 'Videos/demo-video-notes.md',
      hasConfiguredVault: true,
      options: [
        {
          id: 'vault-video',
          kind: 'vault',
          label: SAMPLE_VIDEO_VAULT,
          path: 'Videos/demo-video-notes.md',
          selected: true
        },
        {
          id: 'downloads',
          kind: 'downloads',
          label: 'Downloads',
          path: 'Videos/demo-video-notes.md',
          selected: false
        }
      ]
    },
    captures: [
      {
        id: 'video-1',
        index: 1,
        kind: 'timestamp',
        markerLabel: '02:45',
        summary: '00:45',
        commentPreview:
          'This is the first explicit definition of the core concept. Cross-reference it with the article version later.',
        comment:
          'This is the first explicit definition of the core concept. Cross-reference it with the article version later.',
        meta: 'https://youtube.com/watch?v=demo&t=45'
      },
      {
        id: 'video-2',
        index: 2,
        kind: 'fragment',
        markerLabel: '08:12',
        summary: SAMPLE_VIDEO_CAPTURE_QUOTE,
        fullText:
          'What creates understanding is the judgment you make while watching. The timestamp only helps you return to the moment; the explanation still comes from your comment and the surrounding context.',
        commentPreview:
          'This subtitle fragment works well as a standalone quote with a follow-up note.',
        comment: 'This subtitle fragment works well as a standalone quote with a follow-up note.',
        meta: 'https://youtube.com/watch?v=demo&t=728'
      },
      {
        id: 'video-3',
        index: 3,
        kind: 'timestamp',
        markerLabel: '12:10',
        summary: '12:08',
        draft:
          'Expand the case here and include that counterexample from the comments before saving.',
        meta: 'https://youtube.com/watch?v=demo&t=728',
        editing: true
      }
    ],
    actions: [
      { id: 'video:finish', label: message('videoPanelFinish'), variant: 'primary' },
      { id: 'video:cancel', label: 'Cancel', variant: 'ghost' }
    ]
  },
  videoFloatingPrompt: {
    label: message('videoPromptAction'),
    shortcut: 'Alt+V',
    dismissLabel: 'Dismiss video-note prompt'
  },
  taskSuccess: {
    hero: {
      title: message('schemaRuntimeTaskSuccessTitle'),
      description: message('schemaRuntimeTaskSuccessDescription'),
      pills: ['Success Prompt', 'Support Links', 'Like / Dislike', 'Toast States'],
      icon: 'celebration'
    },
    status: 'success',
    statusMessage: 'Sent successfully to Research Vault',
    statusDetail:
      'The full page was written to `Articles/Research/2026/` using the current vault routing, and classification finished successfully.',
    progress: { value: 100, variant: 'success' },
    feedbackLabel: 'Quick feedback',
    likeLabel: 'Like',
    dislikeLabel: 'Dislike',
    dismissLabel: 'Click anywhere else to close',
    likeToast: {
      title: message('supportPromptLikeThankYou'),
      detail: message('schemaPreviewTaskSuccessLikeToastDetail'),
      actions: ['Write a review', 'I already left one']
    },
    dislikeToast: {
      title: message('supportPromptDislikeToastTitle'),
      detail: message('schemaPreviewTaskSuccessDislikeToastDetail'),
      actions: ['Discuss on Reddit', 'GitHub']
    }
  }
};
