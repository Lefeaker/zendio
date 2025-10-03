import { createElement, getElementById } from '../utils/dom';

export function renderDomainMappings(mappings: Record<string, string>): void {
  const container = getElementById<HTMLDivElement>('domainMappings');
  container.innerHTML = '';

  Object.entries(mappings).forEach(([domain, name]) => {
    addMappingRow(domain, name);
  });
}

export function addMappingRow(domain = '', name = ''): void {
  const container = getElementById<HTMLDivElement>('domainMappings');

  const row = createElement('div');
  row.className = 'mapping-item';

  const domainInput = createElement('input');
  domainInput.type = 'text';
  domainInput.placeholder = '例如: mp.weixin.qq.com';
  domainInput.value = domain;
  domainInput.className = 'mapping-domain';

  const nameInput = createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = '例如: 公众号';
  nameInput.value = name;
  nameInput.className = 'mapping-name';

  const deleteBtn = createElement('button');
  deleteBtn.textContent = '删除';
  deleteBtn.className = 'danger';
  deleteBtn.addEventListener('click', () => {
    row.remove();
  });

  row.append(domainInput, nameInput, deleteBtn);
  container.appendChild(row);
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
