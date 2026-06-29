import { DEFAULT_CHAT_TITLE } from './constants';
import { collectOrderedElements, normalizeText, pickFirstElement } from './dom';
import { chatElementToMarkdown } from './markdown';
import type { ParseConfig, ParseDiagnostic, ParsedMessage, ParsedResult } from '../types';
import type {
  ContainerResolver,
  ContentResolver,
  MessageDedupeStrategy,
  ParserProfile,
  ProfileContentContext,
  ProfileMessageContext,
  ProfileMessageRole,
  RoleResolver
} from './profileTypes';

export type { ParserProfile } from './profileTypes';
export {
  collectOrderedElements,
  findFirstNormalizedText,
  normalizeText,
  pickFirstElement,
  removeElements
} from './dom';

const PROFILE_NO_CONTAINERS_DIAGNOSTIC_CODE = 'profile_no_containers';
const PROFILE_NO_MESSAGES_DIAGNOSTIC_CODE = 'profile_no_messages';
const PROFILE_ROLE_UNRESOLVED_DIAGNOSTIC_CODE = 'profile_role_unresolved';

function profileDiagnostic(code: string, profile: ParserProfile): ParseDiagnostic {
  return {
    code,
    severity: 'warning',
    detail: profile.platform
  };
}

export function composeRoleResolvers(...resolvers: readonly RoleResolver[]): RoleResolver {
  return (context) => {
    for (const resolver of resolvers) {
      const role = resolver(context);
      if (role) {
        return role;
      }
    }

    return undefined;
  };
}

export function roleByContainerAttribute(
  attribute: string,
  roleMap: Readonly<Record<string, ProfileMessageRole>>,
  fallback?: ProfileMessageRole
): RoleResolver {
  return ({ container }) => {
    const value = container.getAttribute(attribute)?.trim();
    if (value && roleMap[value]) {
      return roleMap[value];
    }

    return fallback;
  };
}

export function roleByClassName(
  roleHints: Readonly<Record<string, ProfileMessageRole>>,
  fallback?: ProfileMessageRole
): RoleResolver {
  return ({ container }) => {
    const className = container.className;
    for (const [hint, role] of Object.entries(roleHints)) {
      if (className.includes(hint)) {
        return role;
      }
    }

    return fallback;
  };
}

export function roleByAncestor(selector: string, role: ProfileMessageRole): RoleResolver {
  return ({ container }) => (container.closest(selector) ? role : undefined);
}

export function roleByDescendant(selector: string, role: ProfileMessageRole): RoleResolver {
  return ({ container }) => (container.querySelector(selector) ? role : undefined);
}

function resolveContainers(
  doc: Document,
  resolver: ContainerResolver,
  config: ParseConfig | undefined
): HTMLElement[] {
  if (typeof resolver === 'function') {
    return Array.from(resolver(doc, config));
  }

  return collectOrderedElements(doc, resolver);
}

function resolveContent(
  resolver: ContentResolver,
  context: ProfileContentContext
): HTMLElement | null {
  if (typeof resolver === 'function') {
    return resolver(context);
  }

  return pickFirstElement(context.container, resolver);
}

function shouldSuppressDuplicate(
  strategy: MessageDedupeStrategy | undefined,
  content: HTMLElement,
  markdown: string,
  seenElements: Set<HTMLElement>,
  seenContent: Set<string>
): boolean {
  if (!strategy) {
    return false;
  }

  const duplicateElement = seenElements.has(content);
  const normalizedContent = normalizeText(markdown);
  const duplicateContent = seenContent.has(normalizedContent);

  if (strategy === 'element' && duplicateElement) {
    return true;
  }
  if (strategy === 'content' && duplicateContent) {
    return true;
  }
  if (strategy === 'element-or-content' && (duplicateElement || duplicateContent)) {
    return true;
  }

  seenElements.add(content);
  seenContent.add(normalizedContent);
  return false;
}

export function parseWithProfile(
  doc: Document,
  profile: ParserProfile,
  config?: ParseConfig
): ParsedResult {
  const containers = resolveContainers(doc, profile.containers, config);
  if (containers.length === 0) {
    return {
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      assets: [],
      diagnostics: [profileDiagnostic(PROFILE_NO_CONTAINERS_DIAGNOSTIC_CODE, profile)]
    };
  }

  const messages: ParsedMessage[] = [];
  const diagnostics: ParseDiagnostic[] = [];
  const seenElements = new Set<HTMLElement>();
  const seenContent = new Set<string>();
  const messageIdPrefix = profile.messageIdPrefix ?? 'msg';
  let messageIndex = 1;
  let roleUnresolved = false;

  containers.forEach((container, index) => {
    const messageContext: ProfileMessageContext = {
      doc,
      container,
      index,
      config
    };
    const role = profile.role(messageContext) ?? profile.fallbackRole;
    if (!role) {
      if (!roleUnresolved) {
        diagnostics.push(profileDiagnostic(PROFILE_ROLE_UNRESOLVED_DIAGNOSTIC_CODE, profile));
        roleUnresolved = true;
      }
      return;
    }

    const contentContext: ProfileContentContext = {
      ...messageContext,
      role
    };
    const content = resolveContent(profile.content, contentContext);
    if (!content) {
      return;
    }

    if (profile.shouldSkipMessage?.({ ...contentContext, content })) {
      return;
    }

    const textContent = normalizeText(content.textContent ?? '');
    if (!textContent) {
      return;
    }

    const fragment = content.cloneNode(true) as HTMLElement;
    profile.cleanup?.(fragment, {
      ...contentContext,
      fragment,
      content
    });

    const markdown = chatElementToMarkdown(fragment);
    if (!markdown.trim()) {
      return;
    }

    if (shouldSuppressDuplicate(profile.dedupe, content, markdown, seenElements, seenContent)) {
      return;
    }

    const message: ParsedMessage = {
      id: `${messageIdPrefix}-${messageIndex++}`,
      role,
      md: markdown,
      text: markdown
    };
    const html = fragment.innerHTML || '';
    if (html) {
      message.html = html;
    }
    messages.push(message);
  });

  if (messages.length === 0) {
    diagnostics.push(profileDiagnostic(PROFILE_NO_MESSAGES_DIAGNOSTIC_CODE, profile));
  }

  const result: ParsedResult = {
    title: profile.title(doc, config).trim() || DEFAULT_CHAT_TITLE,
    messages,
    assets: []
  };
  const resolvedModel = profile.model?.(doc, config);
  const model = resolvedModel ? normalizeText(resolvedModel) : '';
  if (model) {
    result.model = model;
  }
  if (diagnostics.length > 0) {
    result.diagnostics = diagnostics;
  }

  return result;
}
