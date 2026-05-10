import { existsSync, readFileSync } from 'node:fs';

const HOTSPOT_PATH = 'docs/production-code-hotspots.md';

function readHotspotFiles(source = readFileSync(HOTSPOT_PATH, 'utf8')) {
  return source
    .split('\n')
    .filter((line) => line.startsWith('| `src/'))
    .map((line) => line.match(/`([^`]+)`/)?.[1])
    .filter(Boolean);
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

export function buildProductionShapeReport(source = readFileSync(HOTSPOT_PATH, 'utf8')) {
  return readHotspotFiles(source).map((file) => {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    return {
      file,
      exists: existsSync(file),
      loc: text ? text.split('\n').length : 0,
      createElement: countMatches(text, /\b(?:document\.)?createElement\b/g),
      addEventListener: countMatches(text, /\baddEventListener\b/g),
      switchCount: countMatches(text, /\bswitch\s*\(/g),
      textAssignments: countMatches(text, /\.(?:textContent|placeholder)\s*=/g)
    };
  });
}

const report = buildProductionShapeReport();
console.log('Production code shape report');
for (const row of report) {
  console.log(
    `${row.file} | exists=${row.exists} | loc=${row.loc} | createElement=${row.createElement} | addEventListener=${row.addEventListener} | switch=${row.switchCount} | textAssignments=${row.textAssignments}`
  );
}
