import { AUDIT_REGRESSION_LIMITS, assertClosedKeys, assertPlainJson } from './canonical-json.mjs';

function normalizeSeverityCounts(report) {
  assertAuditReportSchema(report);
  const vulnerabilities = report?.metadata?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    throw new Error('npm audit report lacks metadata.vulnerabilities.');
  }
  const counts = {};
  for (const key of ['info', 'low', 'moderate', 'high', 'critical', 'total']) {
    if (!Object.prototype.hasOwnProperty.call(vulnerabilities, key)) {
      throw new Error(`Missing vulnerability count for ${key}.`);
    }
    const value = vulnerabilities[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid vulnerability count for ${key}.`);
    }
    counts[key] = value;
  }
  const computedTotal = counts.info + counts.low + counts.moderate + counts.high + counts.critical;
  if (counts.total !== computedTotal) {
    throw new Error('npm audit vulnerability total does not equal severity sum.');
  }
  return counts;
}

function assertBoundedString(value, label, { allowEmpty = false } = {}) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    Buffer.byteLength(value, 'utf8') > AUDIT_REGRESSION_LIMITS.maxStringBytes
  )
    throw new Error(`${label} is not a bounded string.`);
}

const CVSS_V3_BASE_VECTOR =
  /^CVSS:(3\.[01])\/AV:([NALP])\/AC:([LH])\/PR:([NLH])\/UI:([NR])\/S:([UC])\/C:([NLH])\/I:([NLH])\/A:([NLH])$/u;
const CANONICAL_CWE = /^CWE-[1-9][0-9]*$/u;
const CVSS_AV = Object.freeze({ N: 0.85, A: 0.62, L: 0.55, P: 0.2 });
const CVSS_AC = Object.freeze({ L: 0.77, H: 0.44 });
const CVSS_UI = Object.freeze({ N: 0.85, R: 0.62 });
const CVSS_CIA = Object.freeze({ N: 0, L: 0.22, H: 0.56 });
const CVSS_PR_UNCHANGED = Object.freeze({ N: 0.85, L: 0.62, H: 0.27 });
const CVSS_PR_CHANGED = Object.freeze({ N: 0.85, L: 0.68, H: 0.5 });

function roundUpCvss(value) {
  const integerAtFiveDecimals = Math.round(value * 100000);
  return integerAtFiveDecimals % 10000 === 0
    ? integerAtFiveDecimals / 100000
    : (Math.floor(integerAtFiveDecimals / 10000) + 1) / 10;
}

function calculateCvssBaseScore(vectorString) {
  const match = CVSS_V3_BASE_VECTOR.exec(vectorString);
  if (!match) {
    throw new Error('npm audit advisory cvss.vectorString must be a canonical CVSS 3 base vector.');
  }
  const [, version, av, ac, pr, ui, scope, confidentiality, integrity, availability] = match;
  const scopeChanged = scope === 'C';
  const privilegeRequired = (scopeChanged ? CVSS_PR_CHANGED : CVSS_PR_UNCHANGED)[pr];
  const exploitability = 8.22 * CVSS_AV[av] * CVSS_AC[ac] * privilegeRequired * CVSS_UI[ui];
  const impactSubScore =
    1 - (1 - CVSS_CIA[confidentiality]) * (1 - CVSS_CIA[integrity]) * (1 - CVSS_CIA[availability]);
  const impact = !scopeChanged
    ? 6.42 * impactSubScore
    : version === '3.0'
      ? 7.52 * (impactSubScore - 0.029) - 3.25 * (impactSubScore - 0.02) ** 15
      : 7.52 * (impactSubScore - 0.029) - 3.25 * (impactSubScore * 0.9731 - 0.02) ** 13;
  if (impact <= 0) return 0;
  const combined = impact + exploitability;
  return roundUpCvss(Math.min(scopeChanged ? 1.08 * combined : combined, 10));
}

function assertCvssSchema(cvss) {
  assertClosedKeys(cvss, ['score', 'vectorString'], 'npm audit advisory cvss');
  if (
    typeof cvss.score !== 'number' ||
    !Number.isFinite(cvss.score) ||
    Object.is(cvss.score, -0) ||
    cvss.score < 0 ||
    cvss.score > 10 ||
    !Number.isInteger(cvss.score * 10)
  ) {
    throw new Error('npm audit advisory cvss.score must be a canonical 0..10 decimal.');
  }
  assertBoundedString(cvss.vectorString, 'npm audit advisory cvss.vectorString');
  const calculated = calculateCvssBaseScore(cvss.vectorString);
  if (cvss.score !== calculated) {
    throw new Error('npm audit advisory cvss.score does not match its canonical base vector.');
  }
}

function assertCweSchema(cwe) {
  if (!Array.isArray(cwe)) throw new Error('npm audit advisory cwe must be an array.');
  if (cwe.length > AUDIT_REGRESSION_LIMITS.maxCweEntriesPerAdvisory) {
    throw new Error('npm audit advisory cwe exceeds its closed row limit.');
  }
  let previous = 0;
  for (const entry of cwe) {
    assertBoundedString(entry, 'npm audit advisory cwe entry');
    if (!CANONICAL_CWE.test(entry)) {
      throw new Error('npm audit advisory cwe entry must be canonical CWE-positive-decimal.');
    }
    const numeric = Number(entry.slice(4));
    if (!Number.isSafeInteger(numeric) || numeric <= previous) {
      throw new Error('npm audit advisory cwe entries must be unique and strictly ascending.');
    }
    previous = numeric;
  }
}

export function assertAuditReportSchema(report) {
  assertPlainJson(report, { path: 'npm-audit-report' });
  assertClosedKeys(
    report,
    ['auditReportVersion', 'vulnerabilities', 'metadata'],
    'npm audit report'
  );
  if (![2, 3].includes(report.auditReportVersion))
    throw new Error('Unsupported npm audit report version.');
  if (!report.vulnerabilities || Array.isArray(report.vulnerabilities)) {
    throw new Error('npm audit vulnerabilities must be an object.');
  }
  if (
    Object.keys(report.vulnerabilities).length > AUDIT_REGRESSION_LIMITS.maxVulnerabilityPackages
  ) {
    throw new Error('npm audit report contains too many vulnerability package rows.');
  }
  assertClosedKeys(report.metadata, ['vulnerabilities', 'dependencies'], 'npm audit metadata');
  assertClosedKeys(
    report.metadata.vulnerabilities,
    ['info', 'low', 'moderate', 'high', 'critical', 'total'],
    'npm audit severity counts'
  );
  assertClosedKeys(
    report.metadata.dependencies,
    ['prod', 'dev', 'optional', 'peer', 'peerOptional', 'total'],
    'npm audit dependency counts'
  );
  for (const value of Object.values(report.metadata.dependencies)) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Invalid npm audit dependency count.');
  }
  for (const [packageName, row] of Object.entries(report.vulnerabilities)) {
    assertBoundedString(packageName, 'npm audit package name');
    assertClosedKeys(
      row,
      ['name', 'severity', 'isDirect', 'via', 'effects', 'range', 'nodes', 'fixAvailable'],
      `npm audit vulnerability ${packageName}`
    );
    if (row.name !== packageName) throw new Error('npm audit package row name mismatch.');
    if (!Object.hasOwn(SEVERITY_RANK, row.severity) || row.severity === 'unknown') {
      throw new Error('npm audit package severity is invalid.');
    }
    if (typeof row.isDirect !== 'boolean') throw new Error('npm audit isDirect must be boolean.');
    if (
      !Array.isArray(row.via) ||
      row.via.length > AUDIT_REGRESSION_LIMITS.maxViaEntriesPerPackage
    ) {
      throw new Error(`npm audit via list exceeds limit for ${packageName}.`);
    }
    for (const stringField of ['range'])
      assertBoundedString(row[stringField], `npm audit ${stringField}`, { allowEmpty: true });
    for (const arrayField of ['effects', 'nodes']) {
      if (!Array.isArray(row[arrayField]))
        throw new Error(`npm audit ${arrayField} must be an array.`);
      if (row[arrayField].length > AUDIT_REGRESSION_LIMITS.maxVulnerabilityPackages) {
        throw new Error(`npm audit ${arrayField} exceeds its closed row limit.`);
      }
      for (const entry of row[arrayField])
        assertBoundedString(entry, `npm audit ${arrayField} entry`);
    }
    if (
      !(
        typeof row.fixAvailable === 'boolean' ||
        (row.fixAvailable && typeof row.fixAvailable === 'object')
      )
    ) {
      throw new Error('npm audit fixAvailable has invalid shape.');
    }
    if (row.fixAvailable && typeof row.fixAvailable === 'object') {
      assertClosedKeys(
        row.fixAvailable,
        ['name', 'version', 'isSemVerMajor'],
        'npm audit fixAvailable'
      );
      assertBoundedString(row.fixAvailable.name, 'npm audit fixAvailable.name');
      assertBoundedString(row.fixAvailable.version, 'npm audit fixAvailable.version');
      if (typeof row.fixAvailable.isSemVerMajor !== 'boolean') {
        throw new Error('npm audit fixAvailable.isSemVerMajor must be boolean.');
      }
    }
    for (const via of row.via) {
      if (typeof via === 'string') {
        assertBoundedString(via, 'npm audit via package');
        continue;
      }
      assertClosedKeys(
        via,
        ['source', 'name', 'dependency', 'title', 'url', 'severity', 'range', 'cvss', 'cwe'],
        'npm audit advisory'
      );
      if (
        !(
          (Number.isSafeInteger(via.source) && via.source > 0) ||
          (typeof via.source === 'string' && via.source.length > 0)
        )
      )
        throw new Error('npm audit source invalid.');
      if (typeof via.source === 'string') assertBoundedString(via.source, 'npm audit source');
      for (const field of ['name', 'dependency', 'title', 'url', 'severity', 'range']) {
        assertBoundedString(via[field], `npm audit advisory ${field}`, {
          allowEmpty: field === 'range'
        });
      }
      if (!Object.hasOwn(SEVERITY_RANK, via.severity) || via.severity === 'unknown') {
        throw new Error('npm audit advisory severity invalid.');
      }
      assertCvssSchema(via.cvss);
      assertCweSchema(via.cwe);
    }
  }
}

export function reportExitMatchesCounts(report, exitCode) {
  const counts = normalizeSeverityCounts(report);
  const vulnerable = counts.low + counts.moderate + counts.high + counts.critical > 0;
  return vulnerable ? exitCode === 1 : exitCode === 0;
}

function collectAdvisories(report) {
  assertAuditReportSchema(report);
  const vulnerabilities = report.vulnerabilities ?? {};
  if (Object.keys(vulnerabilities).length > AUDIT_REGRESSION_LIMITS.maxVulnerabilityPackages) {
    throw new Error('npm audit report contains too many vulnerability package rows.');
  }
  const advisories = new Map();
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    const via = Array.isArray(vulnerability?.via) ? vulnerability.via : [];
    if (via.length > AUDIT_REGRESSION_LIMITS.maxViaEntriesPerPackage) {
      throw new Error(`npm audit via list exceeds limit for ${packageName}.`);
    }
    for (const entry of via) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const source = String(entry.source);
      assertBoundedString(source, 'normalized advisory source');
      const identity = source;
      const severity = entry.severity;
      const previous = advisories.get(identity);
      if (previous) throw new Error(`Duplicate/conflicting advisory identity: ${source}.`);
      advisories.set(identity, { packageName, source, severity });
      assertAdvisoryIdentityCapacity(advisories.size);
    }
  }
  return advisories;
}

export function assertAdvisoryIdentityCapacity(count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('npm audit advisory identity count is invalid.');
  }
  if (count > AUDIT_REGRESSION_LIMITS.maxAdvisoryIdentities) {
    throw new Error('npm audit report contains too many advisory identities.');
  }
}

const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
  unknown: 5
});

export function compareAuditReports({
  baselineReport,
  baselineExit,
  candidateReport,
  candidateExit
}) {
  if (![0, 1].includes(baselineExit) || ![0, 1].includes(candidateExit)) {
    throw new Error('npm audit exits must be 0 or 1.');
  }
  if (!reportExitMatchesCounts(baselineReport, baselineExit)) {
    throw new Error('Baseline npm audit exit does not match its vulnerability counts.');
  }
  if (!reportExitMatchesCounts(candidateReport, candidateExit)) {
    throw new Error('Candidate npm audit exit does not match its vulnerability counts.');
  }
  const baselineCounts = normalizeSeverityCounts(baselineReport);
  const candidateCounts = normalizeSeverityCounts(candidateReport);
  const failures = [];
  for (const key of ['info', 'low', 'moderate', 'high', 'critical', 'total']) {
    if (candidateCounts[key] > baselineCounts[key]) {
      failures.push(`${key} count increased: ${baselineCounts[key]} -> ${candidateCounts[key]}`);
    }
  }
  const baselineAdvisories = collectAdvisories(baselineReport);
  const candidateAdvisories = collectAdvisories(candidateReport);
  for (const [packageName, candidate] of Object.entries(candidateReport.vulnerabilities)) {
    const baseline = baselineReport.vulnerabilities[packageName];
    if (!baseline) {
      failures.push(`new vulnerable package: ${packageName}`);
      continue;
    }
    if ((SEVERITY_RANK[candidate.severity] ?? 5) > (SEVERITY_RANK[baseline.severity] ?? 5)) {
      failures.push(
        `package severity increased for ${packageName}: ${baseline.severity} -> ${candidate.severity}`
      );
    }
  }
  for (const [identity, candidate] of candidateAdvisories.entries()) {
    const baseline = baselineAdvisories.get(identity);
    if (!baseline) {
      failures.push(`new advisory: ${candidate.packageName}`);
      continue;
    }
    if ((SEVERITY_RANK[candidate.severity] ?? 5) > (SEVERITY_RANK[baseline.severity] ?? 5)) {
      failures.push(
        `advisory severity increased for ${candidate.packageName}: ${baseline.severity} -> ${candidate.severity}`
      );
    }
  }
  return { ok: failures.length === 0, failures, baselineCounts, candidateCounts };
}
