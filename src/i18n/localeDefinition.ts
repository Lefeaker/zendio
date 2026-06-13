import type { GeneratedMessages as RuntimeMessages } from './generated/messages.generated';

export type { RuntimeMessages };
export interface LocaleStaticMessages {
  extName: string;
  extDescription: string;
}

export interface LocaleDefinition {
  runtime: RuntimeMessages;
  static: LocaleStaticMessages;
}
