type LayoutChild = Node | null | undefined | false;
type LayoutAttributes = Record<string, string>;
type LayoutTag = keyof HTMLElementTagNameMap;

export interface LayoutElementOptions<Tag extends LayoutTag> {
  tag?: Tag;
  className?: string;
  attributes?: LayoutAttributes;
  children?: LayoutChild[];
  textContent?: string;
}

export interface HintTextOptions<Tag extends LayoutTag = 'p'> extends LayoutElementOptions<Tag> {
  text?: string;
}

function appendChildren(target: HTMLElement, children: LayoutChild[] = []): void {
  children.forEach((child) => {
    if (child) {
      target.append(child);
    }
  });
}

export function createLayoutElement<Tag extends LayoutTag = 'div'>(
  options: LayoutElementOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement((options.tag ?? 'div') as Tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }
  if (typeof options.textContent === 'string') {
    element.textContent = options.textContent;
  }
  appendChildren(element, options.children);
  return element;
}

export const createOptionsLayoutElement = createLayoutElement;
export const createContentLayoutElement = createLayoutElement;

export function createHintText<Tag extends LayoutTag = 'p'>(
  options: HintTextOptions<Tag> = {},
  defaults: { tag?: Tag; className: string }
): HTMLElementTagNameMap[Tag] {
  return createLayoutElement({
    tag: options.tag ?? defaults.tag ?? ('p' as Tag),
    className: options.className ?? defaults.className,
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.children ? { children: options.children } : {}),
    ...((options.text ?? options.textContent)
      ? { textContent: options.text ?? options.textContent }
      : {})
  });
}

export function createOptionsPanel<Tag extends LayoutTag = 'div'>(
  options: LayoutElementOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  return createLayoutElement({
    className: options.className ?? 'rounded-lg border border-base-300 bg-base-100 shadow-sm',
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.children ? { children: options.children } : {}),
    ...(typeof options.textContent === 'string' ? { textContent: options.textContent } : {})
  });
}

export function createOptionsSettingRow<Tag extends LayoutTag = 'div'>(
  options: LayoutElementOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  return createLayoutElement({
    className:
      options.className ??
      'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]',
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.children ? { children: options.children } : {}),
    ...(typeof options.textContent === 'string' ? { textContent: options.textContent } : {})
  });
}

export function createOptionsActionRow<Tag extends LayoutTag = 'div'>(
  options: LayoutElementOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  return createLayoutElement({
    className: options.className ?? 'flex flex-wrap gap-2 pt-2',
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.children ? { children: options.children } : {}),
    ...(typeof options.textContent === 'string' ? { textContent: options.textContent } : {})
  });
}

export function createOptionsHintText<Tag extends LayoutTag = 'p'>(
  options: HintTextOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  return createHintText(options, {
    tag: 'p' as Tag,
    className: 'text-sm text-base-content/60 mt-2'
  });
}

export function createOptionsMessageList(
  messages: string[],
  options: { className?: string; role?: string } = {}
): HTMLUListElement {
  const list = createLayoutElement({
    tag: 'ul',
    className: options.className ?? 'list-disc pl-4 space-y-1 text-sm text-base-content/60'
  });
  if (options.role) {
    list.setAttribute('role', options.role);
  }
  messages.forEach((message) => {
    list.append(createLayoutElement({ tag: 'li', textContent: message }));
  });
  return list;
}

export function createContentActionRow<Tag extends LayoutTag = 'div'>(
  options: LayoutElementOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  return createLayoutElement({
    className: options.className ?? 'flex gap-2',
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.children ? { children: options.children } : {}),
    ...(typeof options.textContent === 'string' ? { textContent: options.textContent } : {})
  });
}

export function createContentSurfacePanel<Tag extends LayoutTag = 'div'>(
  options: LayoutElementOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  return createLayoutElement({
    className: options.className ?? 'rounded-xl border border-base-300 bg-base-100/70',
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.attributes ? { attributes: options.attributes } : {}),
    ...(options.children ? { children: options.children } : {}),
    ...(typeof options.textContent === 'string' ? { textContent: options.textContent } : {})
  });
}

export function createContentHintText<Tag extends LayoutTag = 'p'>(
  options: LayoutElementOptions<Tag> = {}
): HTMLElementTagNameMap[Tag] {
  return createHintText(options, {
    tag: 'p' as Tag,
    className: 'text-sm text-base-content/70'
  });
}

export function createContentEmptyState(
  text: string,
  className = 'py-4 text-sm text-base-content/60'
): HTMLParagraphElement {
  return createLayoutElement({
    tag: 'p',
    className,
    textContent: text
  });
}
