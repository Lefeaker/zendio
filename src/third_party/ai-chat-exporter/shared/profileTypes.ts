import type { ParseConfig, ParsedMessage, PlatformId } from '../types';

export type ProfileSelector = string | readonly string[];
export type ProfileMessageRole = ParsedMessage['role'];

export type TitleResolver = (doc: Document, config: ParseConfig | undefined) => string;
export type ModelResolver = (doc: Document, config: ParseConfig | undefined) => string | null;
export type ContainerResolver =
  | ProfileSelector
  | ((doc: Document, config: ParseConfig | undefined) => readonly HTMLElement[]);

export type ProfileMessageContext = {
  doc: Document;
  container: HTMLElement;
  index: number;
  config: ParseConfig | undefined;
};

export type RoleResolver = (
  context: ProfileMessageContext
) => ProfileMessageRole | null | undefined;

export type ProfileContentContext = ProfileMessageContext & {
  role: ProfileMessageRole;
};

export type ContentResolver =
  | ProfileSelector
  | ((context: ProfileContentContext) => HTMLElement | null);

export type CleanupContext = ProfileContentContext & {
  fragment: HTMLElement;
  content: HTMLElement;
};

export type CleanupHook = (fragment: HTMLElement, context: CleanupContext) => void;

export type MessageSkipContext = ProfileContentContext & {
  content: HTMLElement;
};

export type MessageSkipPredicate = (context: MessageSkipContext) => boolean;

export type MessageDedupeStrategy = 'element' | 'content' | 'element-or-content';

export type ParserProfile = {
  platform: PlatformId;
  title: TitleResolver;
  model?: ModelResolver;
  containers: ContainerResolver;
  role: RoleResolver;
  fallbackRole?: ProfileMessageRole;
  content: ContentResolver;
  cleanup?: CleanupHook;
  shouldSkipMessage?: MessageSkipPredicate;
  dedupe?: MessageDedupeStrategy;
  messageIdPrefix?: string;
};
