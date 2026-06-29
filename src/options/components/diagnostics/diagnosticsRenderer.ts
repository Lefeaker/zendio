import type { Messages } from '@i18n';
import { getElementById } from '../../utils/dom';
import type { StoredOptions, CompleteOptions } from '@shared/types/options';
import { getOptionsController } from '../../app/optionsControllerContext';
import { getOptionsI18nResource, getOptionsMessages } from '../../app/i18nContext';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import type { IOptionsRepository } from '@shared/repositories';
import { buildDiagnosticsModel } from './diagnosticsModel';
import {
  createDiagnosticMessage,
  formatDiagnosticMessage,
  renderDiagnosticLine,
  renderDiagnosticReport,
  resolveDiagnosticsMessages
} from './diagnosticsMessages';

export function isEmptyOptions(options: StoredOptions | null | undefined): boolean {
  return !options || Object.keys(options).length === 0;
}

export async function resolveOptionsSnapshot(): Promise<StoredOptions | null> {
  const controller = getOptionsController();
  if (controller) {
    const snapshot = controller.getSnapshot();
    if (snapshot && !isEmptyOptions(snapshot)) {
      return snapshot;
    }
    return controller.loadRaw();
  }
  try {
    const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    return (await optionsRepository.get()) as StoredOptions;
  } catch (error) {
    console.error('[diagnostics] Failed to load options:', error);
    return null;
  }
}

export async function resolveCurrentMessages(): Promise<Messages> {
  try {
    return resolveDiagnosticsMessages(
      (await getOptionsMessages()) ?? getOptionsI18nResource()?.messages
    );
  } catch {
    return resolveDiagnosticsMessages(getOptionsI18nResource()?.messages);
  }
}

export function buildDiagnosticsReport(
  options: StoredOptions | CompleteOptions | null | undefined,
  messages?: Partial<Messages> | null
): string {
  return renderDiagnosticReport(
    buildDiagnosticsModel(options),
    resolveDiagnosticsMessages(messages)
  );
}

export async function runDiagnostics(): Promise<void> {
  const diagSection = getElementById<HTMLElement>('diagSection');
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');
  const messages = await resolveCurrentMessages();

  diagSection.style.display = 'block';
  diagOutput.textContent = `${formatDiagnosticMessage(
    createDiagnosticMessage('diagnosticsRunning'),
    messages
  )}\n`;

  try {
    const options = await resolveOptionsSnapshot();
    diagOutput.textContent += buildDiagnosticsReport(options, messages);
  } catch (error) {
    diagOutput.textContent += `\n${renderDiagnosticLine(
      {
        severity: 'error',
        message: createDiagnosticMessage('diagnosticsRunFailed', {
          reason: error instanceof Error ? error.message : String(error)
        })
      },
      messages
    )}\n`;
  }
}
