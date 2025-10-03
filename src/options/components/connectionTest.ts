import { getElementById } from '../utils/dom';
import { requestConnectionTest, isConnectionTestRunning } from '../services/connectionTester';
import { getMessages } from '../../i18n';

function getButton(): HTMLButtonElement {
  return getElementById<HTMLButtonElement>('testConnectionBtn');
}

function getResultContainer(): HTMLDivElement {
  return getElementById<HTMLDivElement>('connectionResult');
}

export function setupConnectionTest(): void {
  const button = getButton();
  button.addEventListener('click', () => { void handleTest(); });

  const result = getResultContainer();
  result.textContent = '';
  result.hidden = true;
  result.className = 'connection-result';
}

async function handleTest(): Promise<void> {
  if (isConnectionTestRunning()) {
    return;
  }

  const button = getButton();
  const result = getResultContainer();

  const msgs = await getMessages();

  button.disabled = true;
  button.dataset.state = 'running';
  result.hidden = false;
  result.className = 'connection-result info';
  result.textContent = msgs.connectionTesting;

  try {
    const response = await requestConnectionTest();
    if (response.success) {
      result.className = 'connection-result success';
    } else {
      result.className = 'connection-result error';
    }

    const details = [];
    details.push(response.message);

    if (response.status !== undefined) {
      details.push(`状态码: ${response.status}`);
    }

    if (response.response) {
      details.push(`响应片段: ${response.response}`);
    }

    if (!response.success && response.error) {
      details.push(`错误: ${response.error}`);
    }

    result.textContent = details.join('\n');
  } catch (error) {
    result.className = 'connection-result error';
    const message = error instanceof Error ? error.message : String(error);
    result.textContent = `${msgs.connectionFailed}: ${message}`;
  } finally {
    button.disabled = false;
    button.dataset.state = 'idle';
  }
}
