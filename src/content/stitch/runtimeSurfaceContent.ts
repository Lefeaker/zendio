import type {
  ClipperSurfaceLabels,
  ClipperSurfaceSource,
  ExportDestinationSurfacePreview,
  PreviewContent,
  SurfaceAction,
  VideoControlBarPopoverSurfacePreferences,
  VideoControlBarPopoverSurfaceTexts
} from '@options/stitch/types';
import type {
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '@content/reader/application/readerPanelModel';
import type {
  VideoPanelCapture,
  VideoPanelTexts
} from '@content/video/application/videoPanelModel';

const VIDEO_PREVIEW_ABSENT_ACTIONS = new Set(['video:add', 'video:save', 'video:delete']);
const CLIPPER_ICON_PATH = 'icons/60x60/zendio_icon_clipt.png';
const READER_ICON_PATH = 'icons/60x60/zendio_icon_readingt.png';
function hero(title: string): PreviewContent['overview']['hero'] {
  return { title, description: '', pills: [] };
}
function createRuntimeContent(): PreviewContent {
  return {
    brand: {
      title: 'Zendio',
      subtitle: '',
      logo: ''
    },
    rendererLabels: {
      resourcePendingBadge: 'Pending',
      resourceOpenAction: 'Open',
      highlightExamplePrefix: 'An exported example can look like ',
      highlightExampleText: 'highlighted text',
      highlightExampleSuffix: ' for easier review.'
    },
    sidebarLinks: [],
    surfaceLinks: [],
    nav: [],
    overview: {
      hero: hero('Overview'),
      stats: [],
      history: []
    },
    languageOptions: [],
    privacyCollected: [],
    privacyExcluded: [],
    storage: {
      hero: hero('Storage'),
      routingTypeOptions: [],
      vaults: [],
      routingRules: []
    },
    captureSources: {
      hero: hero('Capture Sources'),
      aiPlatforms: []
    },
    captureBehavior: {
      hero: hero('Capture Behavior')
    },
    output: {
      hero: hero('Output & Metadata'),
      templateDefaults: {},
      tokens: [],
      domainMappings: [],
      yamlFilters: [],
      yamlRows: [],
      yamlDomainRules: [],
      yamlPreview: '',
      presets: []
    },
    experimental: {
      hero: hero('Experimental'),
      providerOptions: [],
      aiDefaults: {
        provider: '',
        model: '',
        apiUrl: '',
        apiKey: ''
      },
      subtitleLanguages: []
    },
    resources: {
      privacyPolicy: {
        hero: hero('Privacy Policy'),
        sections: []
      },
      dataUsage: {
        hero: hero('Data Usage'),
        sections: []
      },
      onboarding: {
        hero: hero('Onboarding'),
        steps: []
      },
      pluginSetup: {
        hero: hero('Plugin Setup'),
        ports: [],
        steps: [],
        checks: []
      },
      support: {
        hero: hero('Support'),
        channels: [
          {
            title: 'GitHub',
            subtitle: '',
            href: 'https://github.com/Lefeaker/AllinOB/issues'
          }
        ],
        scope: [],
        response: []
      },
      suggestions: {
        hero: hero('Suggestions'),
        channels: []
      },
      contact: {
        hero: hero('Contact'),
        entries: [],
        note: ''
      },
      changelog: {
        hero: hero('Changelog'),
        entries: []
      }
    },
    surfaces: {
      clipper: {
        hero: hero('Clipper Dialog'),
        iconUrl: CLIPPER_ICON_PATH,
        labels: {
          title: '',
          selectionPreview: '',
          commentLabel: ''
        },
        source: {
          title: '',
          host: '',
          initials: '',
          verifiedLabel: ''
        },
        selectedText: '',
        commentPlaceholder: '',
        helper: '',
        shortcuts: [],
        actions: []
      },
      reader: {
        hero: hero('Reader Mode'),
        iconUrl: READER_ICON_PATH,
        labels: {
          title: '',
          subtitle: '',
          exitTriggerLabel: '',
          exitTitle: '',
          exitCancelLabel: '',
          exitConfirmLabel: '',
          notePlaceholder: '',
          fragmentNotePlaceholder: '',
          saveLabel: '',
          deleteLabel: ''
        },
        hint: '',
        counter: '',
        overlaySummary: '',
        highlights: [],
        actions: []
      },
      video: {
        hero: hero('Video Mode'),
        labels: {
          title: '',
          subtitle: '',
          exitTriggerLabel: '',
          exitTitle: '',
          exitCancelLabel: '',
          exitConfirmLabel: '',
          notePlaceholder: '',
          fragmentNotePlaceholder: '',
          saveLabel: '',
          deleteLabel: '',
          addLabel: '',
          emptyCapturePlaceholder: ''
        },
        status: '',
        hint: '',
        counter: '',
        captures: [],
        actions: []
      },
      videoControlBarPopover: {
        texts: {
          notePlaceholder: '',
          noteAriaLabel: '',
          autoPauseLabel: '',
          screenshotLabel: ''
        },
        preferences: {
          autoPauseEnabled: true,
          captureScreenshotEnabled: true
        }
      },
      videoFloatingPrompt: {
        label: '',
        shortcut: '',
        dismissLabel: ''
      },
      taskSuccess: {
        hero: hero('Task Success'),
        status: 'success',
        statusMessage: '',
        progress: {
          value: 100,
          variant: 'success'
        },
        feedbackLabel: '',
        likeLabel: '',
        dislikeLabel: '',
        dismissLabel: '',
        likeToast: {
          title: '',
          detail: '',
          actions: []
        },
        dislikeToast: {
          title: '',
          detail: '',
          actions: []
        }
      }
    },
    maintenanceLog: ''
  };
}

export function createClipperSurfaceContent(input: {
  selectedText: string;
  commentPlaceholder: string;
  labels: ClipperSurfaceLabels;
  source: ClipperSurfaceSource;
  destination?: ExportDestinationSurfacePreview;
  actions: SurfaceAction[];
  iconUrl?: string;
}): PreviewContent {
  const content = createRuntimeContent();
  return {
    ...content,
    surfaces: {
      ...content.surfaces,
      clipper: {
        ...content.surfaces.clipper,
        iconUrl: input.iconUrl ?? content.surfaces.clipper.iconUrl,
        labels: input.labels,
        source: input.source,
        ...(input.destination ? { destination: input.destination } : {}),
        selectedText: input.selectedText,
        commentPlaceholder: input.commentPlaceholder,
        actions: input.actions
      }
    }
  };
}

export function createReaderSurfaceContent(input: {
  texts: ReaderPanelTexts;
  highlights: Array<ReaderPanelHighlight & { draft?: string }>;
  counter: string;
  actions: SurfaceAction[];
  destination?: ExportDestinationSurfacePreview;
  iconUrl?: string;
}): PreviewContent {
  const content = createRuntimeContent();
  return {
    ...content,
    surfaces: {
      ...content.surfaces,
      reader: {
        ...content.surfaces.reader,
        iconUrl: input.iconUrl ?? content.surfaces.reader.iconUrl,
        labels: {
          title: input.texts.title,
          subtitle: input.texts.status,
          exitTriggerLabel: input.texts.cancel,
          exitTitle: input.texts.cancel,
          exitCancelLabel: input.texts.highlightCancelLabel,
          exitConfirmLabel: input.texts.cancel,
          notePlaceholder: input.texts.highlightEditPlaceholder,
          saveLabel: input.texts.highlightSaveLabel,
          deleteLabel: input.texts.highlightDeleteLabel
        },
        hint: input.texts.hint,
        counter: input.counter,
        ...(input.destination ? { destination: input.destination } : {}),
        actions: input.actions,
        highlights: input.highlights.map((highlight) => ({
          id: highlight.id,
          index: highlight.index,
          excerpt: highlight.excerpt,
          fullText: highlight.fullText,
          commentPreview: highlight.commentPreview || input.texts.highlightNoComment,
          comment: highlight.comment || '',
          ...(highlight.draft !== undefined ? { draft: highlight.draft } : {}),
          timestamp: String(highlight.timestamp)
        }))
      }
    }
  };
}

export function createVideoSurfaceContent(input: {
  texts: VideoPanelTexts;
  captures: Array<VideoPanelCapture & { draft?: string }>;
  counter: string;
  actions: SurfaceAction[];
  destination?: ExportDestinationSurfacePreview;
}): PreviewContent {
  const content = createRuntimeContent();
  return {
    ...content,
    surfaces: {
      ...content.surfaces,
      video: {
        ...content.surfaces.video,
        labels: {
          title: input.texts.title,
          subtitle: input.texts.status,
          exitTriggerLabel: input.texts.cancel,
          exitTitle: input.texts.cancel,
          exitCancelLabel: input.texts.captureCancelLabel,
          exitConfirmLabel: input.texts.cancel,
          notePlaceholder: input.texts.captureEditPlaceholder,
          fragmentNotePlaceholder:
            input.texts.fragmentEditPlaceholder ?? input.texts.captureEditPlaceholder,
          saveLabel: input.texts.captureSaveLabel,
          deleteLabel: input.texts.captureDeleteLabel,
          addLabel: input.texts.add,
          emptyCapturePlaceholder: input.texts.captureEditPlaceholder
        },
        hint: input.texts.hint,
        counter: input.counter,
        ...(input.destination ? { destination: input.destination } : {}),
        actions: input.actions.filter(
          (action) => typeof action.id !== 'string' || !VIDEO_PREVIEW_ABSENT_ACTIONS.has(action.id)
        ),
        captures: input.captures.map((capture) => ({
          id: capture.id,
          index: capture.index,
          kind: capture.kind,
          markerLabel: capture.timeLabel || capture.fragmentLabel || String(capture.index),
          summary: capture.selectionPreview || capture.timeLabel || capture.fragmentLabel || '',
          fullText: capture.selectionPreview || '',
          commentPreview: capture.commentPreview ?? capture.comment ?? '',
          comment: capture.comment ?? '',
          ...(capture.draft !== undefined ? { draft: capture.draft } : {}),
          hasScreenshot: capture.hasScreenshot ?? false,
          screenshotState:
            capture.screenshotState ?? (capture.hasScreenshot === true ? 'on' : 'off'),
          meta: capture.shareUrl || capture.fragmentUrl || ''
        }))
      }
    }
  };
}

export function createVideoFloatingPromptSurfaceContent(input: {
  label: string;
  shortcut: string;
  dismissLabel: string;
}): PreviewContent {
  const content = createRuntimeContent();
  return {
    ...content,
    surfaces: {
      ...content.surfaces,
      videoFloatingPrompt: {
        label: input.label,
        shortcut: input.shortcut,
        dismissLabel: input.dismissLabel
      }
    }
  };
}

export function createVideoControlBarPopoverSurfaceContent(input: {
  texts: VideoControlBarPopoverSurfaceTexts;
  preferences: VideoControlBarPopoverSurfacePreferences;
}): PreviewContent {
  const content = createRuntimeContent();
  return {
    ...content,
    surfaces: {
      ...content.surfaces,
      videoControlBarPopover: {
        texts: { ...input.texts },
        preferences: { ...input.preferences }
      }
    }
  };
}

export function createTaskSuccessSurfaceContent(): PreviewContent {
  return createRuntimeContent();
}
