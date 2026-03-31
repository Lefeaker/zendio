import type { Page, TestInfo } from '@playwright/test';

type BrowserDiagnostics = {
  consoleMessages: string[];
  pageErrors: string[];
};

export function attachBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleMessages: [],
    pageErrors: []
  };

  page.on('console', (message) => {
    diagnostics.consoleMessages.push(`[${message.type()}] ${message.text()}`);
  });

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(formatError(error));
  });

  return diagnostics;
}

export async function persistBrowserDiagnostics(
  page: Page,
  testInfo: TestInfo,
  diagnostics: BrowserDiagnostics
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }

  const summary = [
    '# Console',
    diagnostics.consoleMessages.length > 0 ? diagnostics.consoleMessages.join('\n') : '(none)',
    '',
    '# Page errors',
    diagnostics.pageErrors.length > 0 ? diagnostics.pageErrors.join('\n\n') : '(none)'
  ].join('\n');

  await testInfo.attach('browser-console', {
    body: Buffer.from(summary, 'utf8'),
    contentType: 'text/plain'
  });

  await testInfo.attach('browser-console.json', {
    body: Buffer.from(JSON.stringify(diagnostics, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  try {
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach('failure-screenshot', {
      body: screenshot,
      contentType: 'image/png'
    });
  } catch (error) {
    await testInfo.attach('failure-screenshot-error', {
      body: Buffer.from(String(error), 'utf8'),
      contentType: 'text/plain'
    });
  }
}

function formatError(error: Error): string {
  const stack = error.stack?.trim();
  if (stack) {
    return stack;
  }

  return error.message;
}
