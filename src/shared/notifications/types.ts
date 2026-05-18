export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error' | 'critical';

export type NotificationChannel =
  | 'clipper.success'
  | 'clipper.failure'
  | 'clipper.error'
  | 'clipper.warning'
  | 'clipper.injection'
  | 'system.state'
  | 'system.error'
  | 'system.warning'
  | 'system.info'
  | 'system.user'
  | 'system.developer'
  | `custom:${string}`;

export interface NotificationMetadata {
  [key: string]: unknown;
}

export interface AppNotification {
  channel: NotificationChannel;
  severity: NotificationSeverity;
  title: string;
  message: string;
  iconUrl?: string;
  contextMessage?: string;
  requireInteraction?: boolean;
  tag?: string;
  metadata?: NotificationMetadata;
}

export interface NormalizedNotification extends AppNotification {
  type: chrome.notifications.TemplateType | 'basic';
  iconUrl: string;
  timestamp: number;
}

export type NotificationAdapterResult = void | string | Promise<void | string>;

export type NotificationAdapter = (
  id: string,
  notification: NormalizedNotification
) => NotificationAdapterResult;
