import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'build', 'reports');
const INPUT_FILE = path.join(REPORT_DIR, 'layout-issues.json');
const OUTPUT_FILE = path.join(REPORT_DIR, 'layout-summary.html');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readIssues() {
  try {
    const content = await fs.readFile(INPUT_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Unable to read layout issues from ${path.relative(ROOT, INPUT_FILE)}. Run npm run layout:report first.`
    );
  }
}

function renderIssuesTable(issues) {
  if (issues.length === 0) {
    return '<p>✅ No layout issues detected.</p>';
  }

  const rows = issues
    .map((issue) => {
      const cells = [
        escapeHtml(issue.page ?? 'unknown'),
        escapeHtml(issue.language ?? 'unknown'),
        escapeHtml(issue.issue ?? 'n/a'),
        escapeHtml(issue.priority ?? 'n/a'),
        escapeHtml(issue.selector ?? 'n/a'),
        escapeHtml(issue.key ?? ''),
        escapeHtml(issue.details ?? '')
      ];
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
    })
    .join('\n');

  return `
    <table>
      <thead>
        <tr>
          <th>Page</th>
          <th>Language</th>
          <th>Issue</th>
          <th>Priority</th>
          <th>Selector</th>
          <th>Key</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderSummaryDocument(report) {
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const generatedAt = report.generatedAt ? new Date(report.generatedAt).toISOString() : new Date().toISOString();
  const highPriority = issues.filter((issue) => issue.priority === 'high').length;
  const mediumPriority = issues.filter((issue) => issue.priority === 'medium').length;
  const lowPriority = issues.filter((issue) => issue.priority === 'low').length;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Layout Issues Report</title>
    <style>
      body {
        margin: 2rem;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.5;
        color: #1f2933;
        background: #f8fafc;
      }
      header {
        margin-bottom: 1.5rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        background: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
      }
      th, td {
        border-bottom: 1px solid #e2e8f0;
        padding: 0.75rem 1rem;
        text-align: left;
        vertical-align: top;
      }
      th {
        font-weight: 600;
        background: #f1f5f9;
        color: #0f172a;
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
      .summary {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .summary__item {
        background: #ffffff;
        padding: 1rem 1.25rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
        min-width: 160px;
      }
      .summary__item strong {
        display: block;
        font-size: 1.25rem;
        margin-top: 0.25rem;
      }
      .summary__item--high strong {
        color: #dc2626;
      }
      .summary__item--medium strong {
        color: #d97706;
      }
      .summary__item--low strong {
        color: #0f766e;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Layout Issues Report</h1>
      <p>Generated at <time>${escapeHtml(generatedAt)}</time></p>
      <div class="summary">
        <div class="summary__item summary__item--high">
          <span>High Priority</span>
          <strong>${highPriority}</strong>
        </div>
        <div class="summary__item summary__item--medium">
          <span>Medium Priority</span>
          <strong>${mediumPriority}</strong>
        </div>
        <div class="summary__item summary__item--low">
          <span>Low Priority</span>
          <strong>${lowPriority}</strong>
        </div>
        <div class="summary__item">
          <span>Total Issues</span>
          <strong>${issues.length}</strong>
        </div>
      </div>
    </header>
    ${renderIssuesTable(issues)}
  </body>
</html>`;
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const report = await readIssues();
  const html = renderSummaryDocument(report);
  await fs.writeFile(OUTPUT_FILE, html, 'utf8');
  console.log(`Layout summary written to ${path.relative(ROOT, OUTPUT_FILE)}`);
}

main().catch((error) => {
  console.error('[generate-layout-summary] Failed to generate summary.');
  console.error(error);
  process.exitCode = 1;
});
