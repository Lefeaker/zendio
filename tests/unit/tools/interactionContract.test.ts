import { describe, expect, it } from 'vitest';

type InteractionSources = {
  primitiveButton: string;
  primitiveInput: string;
  primitiveSelect: string;
  foundationA11y: string;
  runtimeSurface: string;
  runtimeNodes: string;
  harness: string;
};

type InteractionContractModule = {
  collectInteractionContractFindings: (sources: InteractionSources) => string[];
  readInteractionContractSources: (root?: string) => InteractionSources;
  runInteractionContractAudit: (root?: string) => string[];
};

const {
  collectInteractionContractFindings,
  readInteractionContractSources,
  runInteractionContractAudit
} = (await import(
  // @ts-expect-error Executable ESM tools do not publish declaration files.
  '../../../tools/report-interaction-contract.mjs'
)) as InteractionContractModule;

describe('interaction contract audit', () => {
  it('accepts the production neutral runtime and rewritten dev harness', () => {
    expect(runInteractionContractAudit()).toEqual([]);
  });

  it('fails when neutral runtime dialog semantics or harness ownership drift', () => {
    const sources = readInteractionContractSources();
    const findings = collectInteractionContractFindings({
      ...sources,
      runtimeSurface: sources.runtimeSurface.replace("role: 'dialog'", "role: 'region'"),
      harness: `${sources.harness}\nimport '../ui/hosts/example';\n`
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        'neutral runtime surface missing dialog role',
        'interaction harness still imports a retired UI host'
      ])
    );
  });

  it('requires the visible dialog smoke action and both neutral panels', () => {
    const sources = readInteractionContractSources();
    const findings = collectInteractionContractFindings({
      ...sources,
      harness: sources.harness
        .replaceAll('createOptionsContractPanel', 'removedOptionsPanel')
        .replaceAll('createContentContractPanel', 'removedContentPanel')
        .replace('Open dialog', 'Open surface')
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        'interaction harness missing Options contract panel',
        'interaction harness missing content contract panel',
        'interaction harness missing its visible dialog smoke action'
      ])
    );
  });

  it('requires executable retained primitive probes in addition to source contracts', () => {
    const sources = readInteractionContractSources();
    const findings = collectInteractionContractFindings({
      ...sources,
      harness: sources.harness
        .replaceAll('createPrimitiveButtonElement', 'removedButtonProbe')
        .replaceAll('createInputElement', 'removedInputProbe')
        .replaceAll('createCheckboxElement', 'removedCheckboxProbe')
        .replaceAll('applyValidationA11y', 'removedValidationBehavior')
        .replaceAll('loading-danger-button', 'removed-loading-state')
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        'interaction harness missing the retained loading danger button probe',
        'interaction harness missing the retained input validation probe',
        'interaction harness missing the retained checkbox validation probe',
        'interaction harness missing the loading danger state',
        'interaction harness missing executable validation state changes'
      ])
    );
  });
});
