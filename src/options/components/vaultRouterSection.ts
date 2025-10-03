import { initI18n } from '../../i18n';
import { createElement, getElementById } from '../utils/dom';
import {
  addAdditionalVault,
  addRoutingRule,
  getRulesSnapshot,
  getVaultsSnapshot,
  removeAdditionalVault,
  removeRoutingRule,
  updateAdditionalVault,
  updateRoutingRule
} from '../state/vaultRouterStore';

export async function renderAdditionalVaults(): Promise<void> {
  const container = getElementById<HTMLDivElement>('additionalVaultsList');
  container.innerHTML = '';

  const vaults = getVaultsSnapshot();

  for (const vault of vaults) {
    const row = createElement('div');
    row.className = 'vault-form-row';
    row.dataset.id = vault.id;
    row.innerHTML = `
      <div class="row">
        <div class="form-group">
          <label data-i18n="multiVaultNameLabel">仓库名称</label>
          <input type="text" class="vault-name" value="${vault.name}" placeholder="我的笔记仓库" />
          <small>用于识别此仓库的友好名称</small>
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label data-i18n="httpsUrlLabel">HTTPS URL</label>
          <input type="text" class="vault-https-url" value="${vault.httpsUrl}" placeholder="https://127.0.0.1:27124/" />
          <small data-i18n="httpsUrlHint">通常端口为 27124，适用于安全连接</small>
        </div>
        <div class="form-group">
          <label data-i18n="httpUrlLabel">HTTP URL</label>
          <input type="text" class="vault-http-url" value="${vault.httpUrl}" placeholder="http://127.0.0.1:27123/" />
          <small data-i18n="httpUrlHint">通常端口为 27123，作为备用连接</small>
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label data-i18n="vaultNameLabel">Vault 名称</label>
          <input type="text" class="vault-vault" value="${vault.vault}" placeholder="YourVault" />
          <small data-i18n="vaultNameHint">你的 Obsidian 仓库名称</small>
        </div>
        <div class="form-group">
          <label data-i18n="apiKeyLabel">API Key</label>
          <input type="password" class="vault-api-key" value="${vault.apiKey}" placeholder="••••••••" />
          <small data-i18n="apiKeyHint">在 Obsidian Local REST API 插件中获取</small>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-remove" data-id="${vault.id}">
          <span data-i18n="deleteVaultButton">删除</span>
        </button>
      </div>
    `;

    container.appendChild(row);
  }

  container.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const id = (event.target as HTMLElement).closest('button')?.dataset.id;
      if (!id) return;
      if (confirm('确定要删除这个仓库吗？相关的路由规则也会被删除。')) {
        removeAdditionalVault(id);
        void renderAdditionalVaults();
        void renderRoutingRules();
      }
    });
  });

  container.querySelectorAll('.vault-form-row').forEach(row => {
    const id = (row as HTMLElement).dataset.id;
    if (!id) return;

    const nameInput = row.querySelector('.vault-name') as HTMLInputElement | null;
    const httpsUrlInput = row.querySelector('.vault-https-url') as HTMLInputElement | null;
    const httpUrlInput = row.querySelector('.vault-http-url') as HTMLInputElement | null;
    const vaultInput = row.querySelector('.vault-vault') as HTMLInputElement | null;
    const apiKeyInput = row.querySelector('.vault-api-key') as HTMLInputElement | null;

    nameInput?.addEventListener('input', () => updateAdditionalVault(id, { name: nameInput.value }));
    httpsUrlInput?.addEventListener('input', () => updateAdditionalVault(id, { httpsUrl: httpsUrlInput.value }));
    httpUrlInput?.addEventListener('input', () => updateAdditionalVault(id, { httpUrl: httpUrlInput.value }));
    vaultInput?.addEventListener('input', () => updateAdditionalVault(id, { vault: vaultInput.value }));
    apiKeyInput?.addEventListener('input', () => updateAdditionalVault(id, { apiKey: apiKeyInput.value }));
  });

  await initI18n();
}

export async function renderRoutingRules(): Promise<void> {
  const container = getElementById<HTMLDivElement>('routingRulesList');
  container.innerHTML = '';

  const rules = getRulesSnapshot();
  const vaults = getVaultsSnapshot();

  for (const rule of rules) {
    const row = createElement('div');
    row.className = 'rule-form-row';
    row.dataset.id = rule.id;
    row.style.opacity = rule.enabled ? '1' : '0.6';

    const vaultOptions = vaults
      .map(vault => `<option value="${vault.id}" ${vault.id === rule.vaultId ? 'selected' : ''}>${vault.name}</option>`)
      .join('');

    row.innerHTML = `
      <div class="row">
        <div class="form-group">
          <label data-i18n="ruleTypeLabel">规则类型</label>
          <select class="rule-type">
            <option value="domain" ${rule.type === 'domain' ? 'selected' : ''} data-i18n="ruleTypeDomain">域名匹配</option>
            <option value="keyword" ${rule.type === 'keyword' ? 'selected' : ''} data-i18n="ruleTypeKeyword">关键词匹配</option>
            <option value="url-pattern" ${rule.type === 'url-pattern' ? 'selected' : ''} data-i18n="ruleTypeUrlPattern">URL 模式</option>
          </select>
        </div>
        <div class="form-group">
          <label data-i18n="rulePatternLabel">匹配模式</label>
          <input type="text" class="rule-pattern" value="${rule.pattern}" placeholder="github.com" />
          <small data-i18n="rulePatternPlaceholder">例如: github.com 或 编程,代码</small>
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label data-i18n="ruleTargetVaultLabel">目标仓库</label>
          <select class="rule-vault">
            ${vaultOptions || '<option value="">请先添加额外仓库</option>'}
          </select>
        </div>
        <div class="form-group">
          <label data-i18n="rulePriorityLabel">优先级 (0-100)</label>
          <input type="number" class="rule-priority" value="${rule.priority}" min="0" max="100" placeholder="10" />
          <small>数字越大优先级越高</small>
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label data-i18n="ruleDescriptionLabel">描述（可选）</label>
          <input type="text" class="rule-description" value="${rule.description ?? ''}" placeholder="规则说明" />
          <small>帮助你记住这个规则的用途</small>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" class="rule-enabled" ${rule.enabled ? 'checked' : ''} />
            <span data-i18n="ruleEnabledLabel">启用此规则</span>
          </label>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-remove" data-id="${rule.id}">
          <span data-i18n="deleteRuleButton">删除</span>
        </button>
      </div>
    `;

    container.appendChild(row);
  }

  container.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const id = (event.target as HTMLElement).closest('button')?.dataset.id;
      if (!id) return;
      if (confirm('确定要删除这个规则吗？')) {
        removeRoutingRule(id);
        void renderRoutingRules();
      }
    });
  });

  container.querySelectorAll('.rule-form-row').forEach(row => {
    const id = (row as HTMLElement).dataset.id;
    if (!id) return;

    const typeSelect = row.querySelector('.rule-type') as HTMLSelectElement | null;
    const patternInput = row.querySelector('.rule-pattern') as HTMLInputElement | null;
    const vaultSelect = row.querySelector('.rule-vault') as HTMLSelectElement | null;
    const priorityInput = row.querySelector('.rule-priority') as HTMLInputElement | null;
    const descriptionInput = row.querySelector('.rule-description') as HTMLInputElement | null;
    const enabledCheckbox = row.querySelector('.rule-enabled') as HTMLInputElement | null;

    typeSelect?.addEventListener('change', () => updateRoutingRule(id, { type: typeSelect.value as typeof rule.type }));
    patternInput?.addEventListener('input', () => updateRoutingRule(id, { pattern: patternInput.value }));
    vaultSelect?.addEventListener('change', () => updateRoutingRule(id, { vaultId: vaultSelect.value }));
    priorityInput?.addEventListener('input', () => {
      const priority = parseInt(priorityInput.value, 10);
      updateRoutingRule(id, { priority: Number.isFinite(priority) ? priority : 10 });
    });
    descriptionInput?.addEventListener('input', () => updateRoutingRule(id, { description: descriptionInput.value || undefined }));
    enabledCheckbox?.addEventListener('change', () => {
      const enabled = enabledCheckbox.checked;
      updateRoutingRule(id, { enabled });
      (row as HTMLElement).style.opacity = enabled ? '1' : '0.6';
    });
  });

  await initI18n();
}

export async function handleAddAdditionalVault(): Promise<void> {
  addAdditionalVault();
  await renderAdditionalVaults();
  await renderRoutingRules();
}

export async function handleAddRoutingRule(): Promise<void> {
  const vaults = getVaultsSnapshot();
  if (vaults.length === 0) {
    alert('请先添加额外仓库');
    return;
  }

  const [firstVault] = vaults;
  addRoutingRule({ vaultId: firstVault.id });
  await renderRoutingRules();
}
