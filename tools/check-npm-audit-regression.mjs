#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import * as audit from './npm-audit-regression/audit-report.mjs';
import * as canonical from './npm-audit-regression/canonical-json.mjs';
import { runCli } from './npm-audit-regression/cli.mjs';
import * as evidence from './npm-audit-regression/evidence-chain.mjs';
import * as runtime from './npm-audit-regression/runtime-discovery.mjs';
import * as transition from './npm-audit-regression/transition-validator.mjs';

export const AUDIT_REGRESSION_LIMITS = canonical.AUDIT_REGRESSION_LIMITS;
export const compareAuditReports = audit.compareAuditReports;
export const createDependencyProjection = transition.createDependencyProjection;
export const getAcceptedAuditTransitions = transition.getAcceptedAuditTransitions;
export const getR02ImmutableTransition = transition.getR02ImmutableTransition;

const hookOwners = Object.freeze({
  ...audit,
  ...canonical,
  ...evidence,
  ...runtime,
  ...transition
});
const hookNames = (
  'assertAdvisoryIdentityCapacity assertAuditReportSchema assertClosedLockSchema assertClosedMilestoneLineage assertCommonGitDirectoryBinding assertDirectoryIdentityPolicy assertExactScriptByteTransition ' +
  'assertFrozenR02SemanticTransition assertManifestChainRecords assertManifestKindMilestone assertParentManifest assertPlainJson assertRecordedCommitTree assertSingleManifest assertSingleParentCommit ' +
  'assertTerminalCandidateTopology assertTerminalReanchorTopology assertTerminalSnapshotStable assertTransitionRecord buildNpmAuditInvocation canonicalJsonBytes detectNpmCommand durablePublishNoReplace ' +
  'ensureCleanTree lockReachability lockReverseOwners lockTransitionObject parseTypeRatchet readCommittedBlob readJsonFileBounded rejectEvidenceAliases runGitNetwork runNpmAudit validateDirectoryChain validateMilestoneTransition writeFileExclusive'
).split(' ');

export const npmAuditRegressionTestHooks = Object.freeze(
  Object.fromEntries(
    hookNames.map((name) => {
      if (typeof hookOwners[name] !== 'function')
        throw new Error(`Missing test hook owner: ${name}`);
      return [name, hookOwners[name]];
    })
  )
);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runCli();
