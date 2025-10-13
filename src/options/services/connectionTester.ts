import type { ConnectionTestResult } from '../../shared/types/connection';
import type { VaultConfig } from '../../shared/types';

type TestState = 'idle' | 'pending';
type TestKey = string;

const DEFAULT_KEY = '__default__';
const states = new Map<TestKey, TestState>();

export function isConnectionTestRunning(): boolean {
  return isTestRunning(DEFAULT_KEY);
}

export function isVaultConnectionTestRunning(vaultId: string): boolean {
  return isTestRunning(buildKey(vaultId));
}

export async function requestConnectionTest(): Promise<ConnectionTestResult> {
  return requestTest({ type: 'TEST_CONNECTION' }, DEFAULT_KEY);
}

export async function requestVaultConnectionTest(vault: VaultConfig): Promise<ConnectionTestResult> {
  if (!vault?.id) {
    throw new Error('缺少仓库配置');
  }
  return requestTest({ type: 'TEST_VAULT_CONNECTION', vaultId: vault.id, vault }, buildKey(vault.id));
}

function buildKey(vaultId?: string): TestKey {
  return vaultId ?? DEFAULT_KEY;
}

function isTestRunning(key: TestKey): boolean {
  return states.get(key) === 'pending';
}

function setState(key: TestKey, state: TestState): void {
  states.set(key, state);
}

async function requestTest(message: Record<string, unknown>, key: TestKey): Promise<ConnectionTestResult> {
  if (isTestRunning(key)) {
    throw new Error('Connection test is already running');
  }

  setState(key, 'pending');

  try {
    const response = await chrome.runtime.sendMessage(message);
    return validateResponse(response);
  } finally {
    setState(key, 'idle');
  }
}

function validateResponse(response: unknown): ConnectionTestResult {
  if (!response || typeof response !== 'object') {
    throw new Error('无效的连接测试返回结果');
  }

  const candidate = response as Partial<ConnectionTestResult>;
  if (typeof candidate.success !== 'boolean' || typeof candidate.message !== 'string') {
    throw new Error('连接测试返回数据缺失必要字段');
  }

  return {
    success: candidate.success,
    message: candidate.message,
    status: candidate.status,
    response: candidate.response,
    error: candidate.error
  };
}
