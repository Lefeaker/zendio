import type { PageI18nController } from '../../i18n';
import type { ModalBindingConfig } from '../components/infrastructure/ModalController';
import type { MountedOptionsShell } from './optionsShell';
import { getChangelogByLanguage } from './changelogContent';

type CleanupFn = () => void;

export function createOptionsModalBindings(args: {
  prepareChangelogModal: () => Promise<void>;
}): ModalBindingConfig[] {
  let suggestionsQrCleanup: CleanupFn | null = null;

  const hideSuggestionsQr = (): void => {
    const modal = document.getElementById('suggestionsModal');
    const qrContainer = modal?.querySelector<HTMLElement>('#suggestionsXhsQr');
    if (qrContainer) {
      qrContainer.setAttribute('hidden', 'hidden');
    }
  };

  const prepareSuggestionsModal = (): void => {
    const modal = document.getElementById('suggestionsModal');
    if (!modal) {
      return;
    }

    hideSuggestionsQr();

    const qrTrigger = modal.querySelector<HTMLButtonElement>('#suggestionsXhsTrigger');
    const qrContainer = modal.querySelector<HTMLElement>('#suggestionsXhsQr');
    if (qrTrigger && qrContainer) {
      suggestionsQrCleanup?.();
      suggestionsQrCleanup = null;

      const toggleQr = (event: Event): void => {
        event.preventDefault();
        if (qrContainer.hasAttribute('hidden')) {
          qrContainer.removeAttribute('hidden');
        } else {
          qrContainer.setAttribute('hidden', 'hidden');
        }
      };

      qrTrigger.addEventListener('click', toggleQr);
      suggestionsQrCleanup = () => {
        qrTrigger.removeEventListener('click', toggleQr);
      };
    }
  };

  return [
    { triggerId: 'supportLink', modalId: 'supportModal' },
    {
      triggerId: 'suggestionsLink',
      modalId: 'suggestionsModal',
      onOpen: prepareSuggestionsModal,
      onClose: () => {
        suggestionsQrCleanup?.();
        suggestionsQrCleanup = null;
        hideSuggestionsQr();
      }
    },
    { triggerId: 'contactLink', modalId: 'contactModal' },
    {
      triggerId: 'versionLink',
      modalId: 'changelogModal',
      onOpen: args.prepareChangelogModal
    }
  ];
}

export function handleOptionsUrlHash(args: {
  hash: string;
  mountedShell: MountedOptionsShell;
  revealFragmentShortcuts: () => boolean;
}): void {
  const hash = args.hash.startsWith('#') ? args.hash.slice(1) : args.hash;
  if (!hash) {
    return;
  }

  const schedule = (): void => {
    if (hash.startsWith('section-')) {
      const sectionId = hash.slice('section-'.length);
      void args.mountedShell.navigateTo(sectionId);
      return;
    }
    if (hash === 'shortcuts') {
      void (async () => {
        await args.mountedShell.mountSection('fragment', { activate: true });
        const highlighted = args.revealFragmentShortcuts();
        if (!highlighted) {
          console.warn('[Options] Target element for hash "shortcuts" not found via registry');
        }
      })();
    }
  };

  window.setTimeout(schedule, 200);
}

export async function prepareOptionsChangelogModal(args: {
  ensureDeclarativeI18nController: () => Promise<PageI18nController>;
}): Promise<void> {
  const changelogContent = document.getElementById('changelogContent');
  if (!changelogContent) {
    return;
  }

  const controller = await args.ensureDeclarativeI18nController();
  const resource = controller.getCurrentResource();
  const currentLang = resource?.language || 'zh-CN';
  changelogContent.innerHTML = getChangelogByLanguage(currentLang);
}
