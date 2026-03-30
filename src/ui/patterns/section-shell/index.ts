import { createOptionsSettingRow } from '../../primitives/layout';

export function applySectionChrome(target: HTMLElement, extraClasses: string[] = []): void {
  target.className = [
    'aobx-section',
    'bg-base-100',
    'border',
    'border-base-300',
    'rounded-lg',
    'p-[clamp(22px,2.5vw,32px)]',
    'shadow-card',
    ...extraClasses
  ]
    .filter(Boolean)
    .join(' ');
}

export function createSectionHeader(options: {
  title: string;
  description?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  wrapperClassName?: string;
  titleWrapperClassName?: string;
  actions?: Node[];
}): HTMLElement {
  const header = document.createElement('div');
  header.className = options.wrapperClassName ?? 'grid gap-2 mb-6';

  const titleWrapper = document.createElement('div');
  titleWrapper.className =
    options.titleWrapperClassName ?? 'flex items-center gap-2 text-base-content';

  const title = document.createElement('h2');
  title.className = options.titleClassName ?? 'm-0 text-2xl font-semibold tracking-tight';
  title.textContent = options.title;
  titleWrapper.append(title, ...(options.actions ?? []));
  header.append(titleWrapper);

  if (options.description) {
    const description = document.createElement('div');
    description.className = options.descriptionClassName ?? 'text-base-content/60 text-md';
    description.textContent = options.description;
    header.append(description);
  }

  return header;
}

export function createSectionBody(className = 'mt-6 space-y-6'): HTMLElement {
  const body = document.createElement('div');
  body.className = className;
  return body;
}

export function createSectionSettings(className = 'grid gap-6'): HTMLElement {
  const settings = document.createElement('div');
  settings.className = className;
  return settings;
}

export function createSectionSettingRow(className?: string): HTMLElement {
  return className ? createOptionsSettingRow({ className }) : createOptionsSettingRow();
}
