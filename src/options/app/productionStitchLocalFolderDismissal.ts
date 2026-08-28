import type { PreviewStoreState } from '@options/stitch/types';
import type { SectionInvalidationScope } from '@ui/stitch-runtime/render/sectionInvalidation';

interface LocalFolderDismissal {
  cleanup(): void;
}

export function installLocalFolderDismissal(
  mountRoot: HTMLElement,
  getState: () => PreviewStoreState,
  setState: (state: PreviewStoreState) => void,
  render: (scope: SectionInvalidationScope) => void
): LocalFolderDismissal {
  const dismiss = (event: MouseEvent): void => {
    const state = getState();
    if (
      state.activeLocalFolderVaultIndex === null ||
      state.activeLocalFolderVaultIndex === undefined
    ) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest('.local-folder-cell')) {
      return;
    }
    setState({
      ...state,
      activeLocalFolderVaultIndex: null
    });
    render('storage');
  };

  mountRoot.addEventListener('click', dismiss);
  return {
    cleanup: () => mountRoot.removeEventListener('click', dismiss)
  };
}
