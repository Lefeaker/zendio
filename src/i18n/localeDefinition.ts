import type { RuntimeMessages } from './messages';
export interface LocaleStaticMessages {
  extName: string;
  extDescription: string;
}

export interface LocaleDefinition {
  runtime: RuntimeMessages;
  static: LocaleStaticMessages;
}
