import type { HeroData } from './baseTypes';

export interface SupportChannel {
  id?: string;
  title: string;
  subtitle?: string;
  detail?: string;
  href?: string;
  note?: string;
  icon?: string;
  image?: string;
  imageAlt?: string;
  imagePresentation?: 'inline' | 'modal';
}

export interface ContactEntry {
  title: string;
  subtitle?: string;
  detail?: string;
  href?: string;
  note?: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  summary?: string;
  bullets: string[];
}

export interface SurfaceAction {
  id?: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger';
}

export interface ExportDestinationSurfaceOption {
  id: string;
  kind: 'vault' | 'downloads';
  label: string;
  path: string;
  selected: boolean;
}

export interface ExportDestinationSurfacePreview {
  id: string;
  kind: 'vault' | 'downloads';
  label: string;
  path: string;
  hasConfiguredVault: boolean;
  setupUrl?: string;
  options: ExportDestinationSurfaceOption[];
}

export interface ClipperSurfaceLabels {
  title: string;
  selectionPreview: string;
  commentLabel: string;
}

export interface ClipperSurfaceSource {
  title: string;
  host: string;
  initials: string;
  verifiedLabel: string;
}

export interface RuntimeSessionLabels {
  title: string;
  subtitle: string;
  exitTriggerLabel: string;
  exitTitle: string;
  exitCancelLabel: string;
  exitConfirmLabel: string;
  notePlaceholder: string;
  fragmentNotePlaceholder?: string;
  saveLabel: string;
  deleteLabel: string;
}

export interface ReaderSurfaceHighlight {
  id: string;
  index: number;
  excerpt: string;
  fullText: string;
  commentPreview?: string;
  comment?: string;
  draft?: string;
  timestamp: string;
  editing?: boolean;
}

export interface VideoSurfaceCapture {
  id: string;
  index: number;
  kind: 'timestamp' | 'fragment';
  markerLabel?: string;
  summary: string;
  fullText?: string;
  commentPreview?: string;
  comment?: string;
  draft?: string;
  meta: string;
  hasScreenshot?: boolean;
  screenshotState?: 'off' | 'pending' | 'on';
  editing?: boolean;
}

export interface VideoControlBarPopoverSurfaceTexts {
  notePlaceholder: string;
  noteAriaLabel: string;
  autoPauseLabel: string;
  screenshotLabel: string;
}

export interface VideoControlBarPopoverSurfacePreferences {
  autoPauseEnabled: boolean;
  captureScreenshotEnabled: boolean;
}

export type ToastPreview = { title: string; detail: string; actions?: string[] };

export interface PreviewSurfaces {
  clipper: {
    hero: HeroData;
    iconUrl: string;
    labels: ClipperSurfaceLabels;
    source: ClipperSurfaceSource;
    destination?: ExportDestinationSurfacePreview;
    selectedText: string;
    commentPlaceholder: string;
    helper: string;
    shortcuts: string[];
    actions: SurfaceAction[];
  };
  reader: {
    hero: HeroData;
    iconUrl: string;
    labels: RuntimeSessionLabels;
    hint: string;
    counter: string;
    overlaySummary: string;
    destination?: ExportDestinationSurfacePreview;
    highlights: ReaderSurfaceHighlight[];
    actions: SurfaceAction[];
  };
  video: {
    hero: HeroData;
    iconUrl: string;
    labels: RuntimeSessionLabels & { addLabel: string; emptyCapturePlaceholder: string };
    status: string;
    hint: string;
    counter: string;
    destination?: ExportDestinationSurfacePreview;
    captures: VideoSurfaceCapture[];
    actions: SurfaceAction[];
  };
  videoControlBarPopover?: {
    texts: VideoControlBarPopoverSurfaceTexts;
    preferences: VideoControlBarPopoverSurfacePreferences;
  };
  videoFloatingPrompt: {
    label: string;
    shortcut: string;
    dismissLabel: string;
  };
  taskSuccess: {
    hero: HeroData;
    status: string;
    statusMessage: string;
    statusDetail?: string;
    progress?: {
      value: number;
      variant: 'progress' | 'success' | 'failure' | 'warning';
    };
    feedbackLabel: string;
    likeLabel: string;
    dislikeLabel: string;
    dismissLabel: string;
    likeToast: ToastPreview;
    dislikeToast: ToastPreview;
  };
}
