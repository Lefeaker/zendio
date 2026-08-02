import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { minimalAuditReport } from '../../utils/npmAuditRegressionFixtures';

const modulePath = pathToFileURL(resolve('tools/npm-audit-regression/audit-report.mjs')).href;
const loadAuditReport = () => import(modulePath);

describe('npm audit report comparator', () => {
  it('accepts equal reports and rejects vulnerability count growth', async () => {
    const { compareAuditReports } = await loadAuditReport();
    const baseline = minimalAuditReport();
    expect(
      compareAuditReports({
        baselineReport: baseline,
        baselineExit: 0,
        candidateReport: structuredClone(baseline),
        candidateExit: 0
      }).ok
    ).toBe(true);

    const candidate = minimalAuditReport(1);
    candidate.metadata.vulnerabilities.low = 1;
    expect(
      compareAuditReports({
        baselineReport: baseline,
        baselineExit: 0,
        candidateReport: candidate,
        candidateExit: 1
      })
    ).toMatchObject({
      ok: false,
      failures: ['low count increased: 0 -> 1', 'total count increased: 0 -> 1']
    });
  });

  it('rejects open schema and an exit inconsistent with counts', async () => {
    const { assertAuditReportSchema, compareAuditReports } = await loadAuditReport();
    const open = { ...minimalAuditReport(), extra: true };
    expect(() => assertAuditReportSchema(open)).toThrow('unexpected or missing fields');
    expect(() =>
      compareAuditReports({
        baselineReport: minimalAuditReport(),
        baselineExit: 1,
        candidateReport: minimalAuditReport(),
        candidateExit: 0
      })
    ).toThrow('Baseline npm audit exit');
  });

  it('rejects a new advisory identity even when aggregate counts do not grow', async () => {
    const { compareAuditReports } = await loadAuditReport();
    const baseline = minimalAuditReport(1);
    baseline.metadata.vulnerabilities.low = 1;
    baseline.vulnerabilities = {
      alpha: {
        name: 'alpha',
        severity: 'low',
        isDirect: true,
        via: ['alpha'],
        effects: [],
        range: '*',
        nodes: ['node_modules/alpha'],
        fixAvailable: false
      }
    };
    const candidate = structuredClone(baseline);
    candidate.vulnerabilities = {
      beta: {
        name: 'beta',
        severity: 'low',
        isDirect: true,
        via: ['beta'],
        effects: [],
        range: '*',
        nodes: ['node_modules/beta'],
        fixAvailable: false
      }
    };
    expect(
      compareAuditReports({
        baselineReport: baseline,
        baselineExit: 1,
        candidateReport: candidate,
        candidateExit: 1
      })
    ).toMatchObject({ ok: false });
  });

  it('rejects package severity growth even when aggregate counts remain equal', async () => {
    const { compareAuditReports } = await loadAuditReport();
    const baseline = {
      ...minimalAuditReport(1),
      vulnerabilities: {
        alpha: {
          name: 'alpha',
          severity: 'low',
          isDirect: true,
          via: ['alpha'],
          effects: [],
          range: '*',
          nodes: ['node_modules/alpha'],
          fixAvailable: false
        }
      }
    };
    baseline.metadata.vulnerabilities.low = 1;
    const candidate = structuredClone(baseline);
    candidate.metadata.vulnerabilities.low = 0;
    candidate.metadata.vulnerabilities.high = 1;
    candidate.vulnerabilities.alpha.severity = 'high';
    expect(
      compareAuditReports({
        baselineReport: baseline,
        baselineExit: 1,
        candidateReport: candidate,
        candidateExit: 1
      })
    ).toMatchObject({ ok: false });
  });

  it('rejects closed-schema advisory, fix, via, and CWE mutation families', async () => {
    const { assertAuditReportSchema } = await loadAuditReport();
    const advisory = {
      source: 1,
      name: 'alpha',
      dependency: 'alpha',
      title: 'fixture',
      url: 'https://github.com/advisories/GHSA-fixture',
      severity: 'low',
      range: '*',
      cvss: { score: 7.5, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' },
      cwe: ['CWE-400']
    };
    const report = {
      ...minimalAuditReport(1),
      vulnerabilities: {
        alpha: {
          name: 'alpha',
          severity: 'low',
          isDirect: true,
          via: [advisory],
          effects: [],
          range: '*',
          nodes: ['node_modules/alpha'],
          fixAvailable: false
        }
      }
    };
    report.metadata.vulnerabilities.low = 1;
    expect(() => assertAuditReportSchema(report)).not.toThrow();
    const openAdvisory = {
      ...structuredClone(report),
      vulnerabilities: {
        alpha: { ...report.vulnerabilities.alpha, via: [{ ...advisory, unknown: true }] }
      }
    };
    expect(() => assertAuditReportSchema(openAdvisory)).toThrow('unexpected or missing fields');
    const viaOverflow = {
      ...structuredClone(report),
      vulnerabilities: {
        alpha: { ...report.vulnerabilities.alpha, via: Array.from({ length: 257 }, () => 'alpha') }
      }
    };
    expect(() => assertAuditReportSchema(viaOverflow)).toThrow('via list exceeds');
    const cweOverflow = {
      ...structuredClone(report),
      vulnerabilities: {
        alpha: {
          ...report.vulnerabilities.alpha,
          via: [{ ...advisory, cwe: Array.from({ length: 257 }, (_, index) => `CWE-${index + 1}`) }]
        }
      }
    };
    expect(() => assertAuditReportSchema(cweOverflow)).toThrow('cwe exceeds');
  });
});
