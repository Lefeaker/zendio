import { createElement, getElementById } from '../utils/dom';
import { getMessages } from '../../i18n';

const MAX_EMPTY_ROWS = 3;

const defaultLabels = {
  domain: '例如: mp.weixin.qq.com',
  name: '例如: 公众号',
  delete: '删除'
};

const labels = { ...defaultLabels };
let labelsPromise: Promise<void> | null = null;

export function resetDomainMappingLabels(): void {
  labelsPromise = null;
  labels.domain = defaultLabels.domain;
  labels.name = defaultLabels.name;
  labels.delete = defaultLabels.delete;
}

async function ensureLocalizedLabels(): Promise<void> {
  if (!labelsPromise) {
    labelsPromise = getMessages()
      .then((msgs) => {
        labels.domain = msgs.domainMappingDomainPlaceholder || defaultLabels.domain;
        labels.name = msgs.domainMappingNamePlaceholder || defaultLabels.name;
        labels.delete = msgs.domainMappingDeleteButton || defaultLabels.delete;
      })
      .catch((error) => {
        console.warn('[domainMappings] Failed to load localized labels:', error);
      });
  }
  await labelsPromise;
}

interface AddMappingRowOptions {
  autoFocus?: boolean;
  skipEmptyLimit?: boolean;
}

function highlightRow(row: HTMLDivElement): void {
  row.classList.add('flash');
  window.setTimeout(() => {
    row.classList.remove('flash');
  }, 1200);
}

export function renderDomainMappings(mappings: Record<string, string>): void {
  const container = getElementById<HTMLDivElement>('domainMappings');
  container.innerHTML = '';

  Object.entries(mappings).forEach(([domain, name]) => {
    addMappingRow(domain, name, { skipEmptyLimit: true, autoFocus: false });
  });
}

export function addMappingRow(domain = '', name = '', options: AddMappingRowOptions = {}): void {
  const container = getElementById<HTMLDivElement>('domainMappings');

  const trimmedDomain = domain.trim();
  const trimmedName = name.trim();
  const isEmptyRow = trimmedDomain.length === 0 && trimmedName.length === 0;

  if (!options.skipEmptyLimit && isEmptyRow) {
    const emptyRows = Array.from(container.querySelectorAll('.mapping-item')).filter((existingRow) => {
      const existingDomain = (existingRow.querySelector('.mapping-domain') as HTMLInputElement | null)?.value.trim();
      const existingName = (existingRow.querySelector('.mapping-name') as HTMLInputElement | null)?.value.trim();
      return !(existingDomain && existingDomain.length > 0) && !(existingName && existingName.length > 0);
    });

    if (emptyRows.length >= MAX_EMPTY_ROWS) {
      const target = emptyRows[0] as HTMLDivElement | undefined;
      if (target) {
        highlightRow(target);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (target.querySelector('.mapping-domain') as HTMLInputElement | null)?.focus();
      }
      return;
    }
  }

  const row = createElement('div');
  row.className = 'mapping-item';

  const domainInput = createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = labels.domain;
  domainInput.value = domain;
  domainInput.className = 'mapping-domain';

  const nameInput = createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = labels.name;
  nameInput.value = name;
  nameInput.className = 'mapping-name';

  const deleteBtn = createElement('button');
  deleteBtn.textContent = labels.delete;
  deleteBtn.className = 'danger';
  deleteBtn.addEventListener('click', () => {
    row.remove();
  });

  row.append(domainInput, nameInput, deleteBtn);
  container.appendChild(row);

  void ensureLocalizedLabels().then(() => {
    domainInput.placeholder = labels.domain;
    nameInput.placeholder = labels.name;
    deleteBtn.textContent = labels.delete;
  });

  if (options.autoFocus) {
    window.requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      domainInput.focus();
      highlightRow(row);
    });
  }
}

export function collectDomainMappings(): Record<string, string> {
  const mappings: Record<string, string> = {};
  const rows = document.querySelectorAll('.mapping-item');

  rows.forEach(row => {
    const domainInput = row.querySelector('.mapping-domain') as HTMLInputElement | null;
    const nameInput = row.querySelector('.mapping-name') as HTMLInputElement | null;

    const domain = domainInput?.value.trim();
    const name = nameInput?.value.trim();

    if (domain && name) {
      mappings[domain] = name;
    }
  });

  return mappings;
}
