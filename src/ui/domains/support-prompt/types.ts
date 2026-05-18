import type { AppError } from '@shared/errors';

export interface SupportLink {
  icon: string;
  title: string;
  description?: string;
  url: string;
}

export type PromptStatus = 'success' | 'failure' | 'warning' | 'progress';

export interface SupportPromptProgress {
  value: number;
  label?: string;
  variant?: 'progress' | 'success' | 'failure' | 'warning';
}

export interface SupportPromptOptions {
  vaultName?: string;
  status?: PromptStatus;
  errorMessage?: string;
  error?: AppError;
  progress?: SupportPromptProgress;
}

export interface SupportPromptMessages {
  dialogLabel: string;
  title: string;
  koFiTitle: string;
  koFiDescription: string;
  afdianTitle: string;
  afdianDescription: string;
  githubTitle: string;
  githubDescription: string;
  feedbackGroupLabel: string;
  likeLabel: string;
  dislikeLabel: string;
  dismiss: string;
  statusSuccess: string;
  statusSuccessWithVault: string;
  statusWarning: string;
  statusWarningWithReason: string;
  statusFailure: string;
  statusFailureWithReason: string;
  likeThankYou: string;
  reviewLinkLabel: string;
  reviewAcknowledgedLabel: string;
  dislikeToastTitle: string;
  dislikeRedditLinkLabel: string;
  dislikeQrLinkLabel: string;
  dislikeQrPlaceholder?: string;
}

export interface ResolvedStatusMessage {
  text: string;
  codeSuffix?: string;
  extraLine?: string;
}

export interface SupportPromptViewConfig {
  messages: SupportPromptMessages;
  links: SupportLink[];
  status: PromptStatus;
  statusMessage: ResolvedStatusMessage;
  onLike: () => void;
  onDislike: () => void;
  onClose: () => void;
  onLinkClick?: (url: string) => void;
}

export type ReviewPromptState = {
  hasClickedReview?: boolean;
  hasConfirmedReview?: boolean;
};

export type LikeToastVariant = 'first' | 'returning' | 'acknowledged';
export type ToastVariant = LikeToastVariant | 'dislike';
