import type { ConnectionTestResult } from '../../shared/types/connection';

type TestState = 'idle' | 'pending';

let state: TestState = 'idle';

export function isConnectionTestRunning(): boolean {
  return state === 'pending';
}

export async function requestConnectionTest(): Promise<ConnectionTestResult> {
  if (state === 'pending') {
    throw new Error('Connection test is already running');
  }

  state = 'pending';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' });
    const result = validateResponse(response);
    return result;
  } finally {
    state = 'idle';
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
