import type { Messages } from './messages';

export interface LocaleStaticMessages {
  extName: string;
  extDescription: string;
}

export interface LocaleDefinition {
  runtime: Messages;
  static: LocaleStaticMessages;
}
