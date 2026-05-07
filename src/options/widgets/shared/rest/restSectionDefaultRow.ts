import { UiInput as DaisyInput } from '@ui/primitives/input';
import { DaisyCard } from '@ui/primitives/card';
import { UiCheckbox as DaisyCheckbox } from '@ui/primitives/checkbox';
import type { RestSectionMessagesLike } from './restSectionLayout';

export function buildRestDefaultRow(params: {
  createElement: typeof document.createElement;
  messages: RestSectionMessagesLike | null;
  onNameInput: (value: string) => void;
  onHttpsInput: (value: string) => void;
  onHttpInput: (value: string) => void;
  onApiKeyInput: (value: string) => void;
  bindDefaultNameInput: (input: HTMLInputElement) => void;
  bindDefaultHttpsInput: (input: HTMLInputElement) => void;
  bindDefaultHttpInput: (input: HTMLInputElement) => void;
  bindDefaultApiKeyInput: (input: HTMLInputElement) => void;
}): HTMLElement {
  const {
    createElement,
    messages,
    onNameInput,
    onHttpsInput,
    onHttpInput,
    onApiKeyInput,
    bindDefaultNameInput,
    bindDefaultHttpsInput,
    bindDefaultHttpInput,
    bindDefaultApiKeyInput
  } = params;
  const row = createElement('div');
  row.className = 'grid grid-cols-[minmax(0,1fr)] gap-4';

  row.append(buildRestDefaultHeading(createElement, messages));
  row.append(
    buildRestDefaultFields({
      createElement,
      messages,
      onNameInput,
      onHttpsInput,
      onHttpInput,
      onApiKeyInput,
      bindDefaultNameInput,
      bindDefaultHttpsInput,
      bindDefaultHttpInput,
      bindDefaultApiKeyInput
    })
  );
  row.append(buildRestDefaultActions(createElement, messages));

  const cardHost = createElement('div');
  cardHost.className = 'p-3 border-b border-base-300/50 bg-base-100/50';
  new DaisyCard(cardHost).render({ body: row });
  return cardHost;
}

function buildRestDefaultHeading(
  createElement: typeof document.createElement,
  messages: RestSectionMessagesLike | null
): HTMLElement {
  const heading = createElement('div');
  heading.className = 'flex items-center justify-between gap-3';

  const badge = createElement('span');
  badge.className = 'badge badge-accent badge-sm';
  badge.textContent = messages?.defaultVaultBadge ?? '默认仓库';
  heading.append(badge);

  const enabledHost = createElement('div');
  const enabledCheckbox = new DaisyCheckbox(enabledHost).render({
    label: messages?.ruleEnabledLabel ?? '启用',
    checked: true,
    disabled: true,
    labelClassName: 'text-base-content/60',
    inputClassName: 'pointer-events-none'
  });
  enabledCheckbox.checked = true;
  enabledCheckbox.disabled = true;
  heading.append(enabledHost);

  return heading;
}

function buildRestDefaultFields(args: {
  createElement: typeof document.createElement;
  messages: RestSectionMessagesLike | null;
  onNameInput: (value: string) => void;
  onHttpsInput: (value: string) => void;
  onHttpInput: (value: string) => void;
  onApiKeyInput: (value: string) => void;
  bindDefaultNameInput: (input: HTMLInputElement) => void;
  bindDefaultHttpsInput: (input: HTMLInputElement) => void;
  bindDefaultHttpInput: (input: HTMLInputElement) => void;
  bindDefaultApiKeyInput: (input: HTMLInputElement) => void;
}): HTMLElement {
  const {
    createElement,
    messages,
    onNameInput,
    onHttpsInput,
    onHttpInput,
    onApiKeyInput,
    bindDefaultNameInput,
    bindDefaultHttpsInput,
    bindDefaultHttpInput,
    bindDefaultApiKeyInput
  } = args;
  const fields = createElement('div');
  fields.className = 'grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4';

  const nameCell = buildRestInputCell(
    createElement,
    'restVault',
    messages?.vaultNamePlaceholder ?? '默认仓库',
    'text',
    onNameInput
  );
  const nameInput = nameCell.querySelector<HTMLInputElement>('input');
  if (nameInput) {
    nameInput.setAttribute('data-i18n-placeholder', 'vaultNamePlaceholder');
    bindDefaultNameInput(nameInput);
  }
  fields.append(
    wrapRestDefaultField(createElement, messages?.vaultNameLabel ?? '仓库名称', nameCell)
  );

  const httpsCell = buildRestInputCell(
    createElement,
    'restHttpsUrl',
    'https://127.0.0.1:27124/',
    'text',
    onHttpsInput
  );
  const httpsInput = httpsCell.querySelector<HTMLInputElement>('input');
  if (httpsInput) {
    bindDefaultHttpsInput(httpsInput);
  }
  fields.append(
    wrapRestDefaultField(createElement, messages?.httpsUrlLabel ?? 'HTTPS URL', httpsCell)
  );

  const httpCell = buildRestInputCell(
    createElement,
    'restHttpUrl',
    'http://127.0.0.1:27123/',
    'text',
    onHttpInput
  );
  const httpInput = httpCell.querySelector<HTMLInputElement>('input');
  if (httpInput) {
    bindDefaultHttpInput(httpInput);
  }
  fields.append(
    wrapRestDefaultField(createElement, messages?.httpUrlLabel ?? 'HTTP URL', httpCell)
  );

  const apiCell = buildRestInputCell(
    createElement,
    'restKey',
    '••••••••',
    'password',
    onApiKeyInput
  );
  const apiInput = apiCell.querySelector<HTMLInputElement>('input');
  if (apiInput) {
    bindDefaultApiKeyInput(apiInput);
  }
  fields.append(wrapRestDefaultField(createElement, messages?.apiKeyLabel ?? 'API Key', apiCell));

  return fields;
}

function buildRestDefaultActions(
  createElement: typeof document.createElement,
  messages: RestSectionMessagesLike | null
): HTMLElement {
  const actions = createElement('div');
  actions.className = 'flex justify-end';

  const spacerButton = createElement('button');
  spacerButton.className =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 px-3 opacity-0 cursor-default';
  spacerButton.type = 'button';
  spacerButton.textContent = messages?.deleteVaultButton ?? '删除';
  spacerButton.disabled = true;
  spacerButton.setAttribute('aria-hidden', 'true');
  spacerButton.tabIndex = -1;
  actions.append(spacerButton);

  return actions;
}

function wrapRestDefaultField(
  createElement: typeof document.createElement,
  labelText: string,
  field: HTMLElement
): HTMLElement {
  const wrapper = createElement('div');
  wrapper.className = 'grid gap-2';
  const label = createElement('label');
  label.className = 'text-xs font-medium text-base-content/60';
  label.textContent = labelText;
  wrapper.append(label, field);
  return wrapper;
}

function buildRestInputCell(
  createElement: typeof document.createElement,
  id: string,
  placeholder: string,
  type: 'text' | 'password',
  onInput: (value: string) => void
): HTMLElement {
  const host = createElement('div');
  host.className = 'w-full';
  const daisyInput = new DaisyInput(host);
  const input = daisyInput.render({
    type,
    placeholder,
    variant: 'bordered',
    size: 'sm',
    onChange: (value) => {
      const next = type === 'password' ? value : value.trim();
      onInput(next);
    }
  });
  input.id = id;
  return host;
}
