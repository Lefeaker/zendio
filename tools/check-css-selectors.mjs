// Selector compatibility follows Stylelint 16.26.1 (MIT). See licenses/stylelint-MIT.txt.
import { globSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import resolveNestedSelector from 'postcss-resolve-nested-selector';

export const CSS_PATTERNS = ['src/options/**/*.css', 'src/onboarding/**/*.css', 'src/ui/**/*.css'];
const CLASS_PATTERN = /^(?!aob-)[a-z0-9_-]+$/;
const IGNORED_FILE = 'src/options/styles/tailwind.css';

// Preserve the former selector-class-pattern rule's standard-CSS boundary.
// Preprocessor/template selectors are not class names that this gate can resolve.
function isStandardSelector(selector) {
  return !(
    /\{.+?\}/s.test(selector) ||
    /\$\(.+?\)/.test(selector) ||
    selector.startsWith('%') ||
    selector.endsWith(':') ||
    /:extend(?:\(.*?\))?/.test(selector) ||
    /\.[\w-]+\(.*\).+/.test(selector) ||
    (selector.endsWith(')') && !selector.includes(':')) ||
    /\(@.*\)$/.test(selector) ||
    /<%|%>|\/\//.test(selector)
  );
}

function isKeyframeSelector(selector) {
  return (
    /^(?:from|to|(?:\d+|\d*\.\d+)%)$/.test(selector) ||
    /^(?:cover|contain|entry|exit|entry-crossing|exit-crossing)\s+(?:\d+|\d*\.\d+)%$/i.test(
      selector
    )
  );
}

export function lintCssSource(css, file) {
  const issues = [];
  const report = (message, line = 1, column = 1, rule = 'selector-class-pattern') =>
    issues.push({ file, line, column, rule, message });
  try {
    const root = postcss.parse(css, { from: file });
    root.walkRules((node) => {
      if (!isStandardSelector(node.selector) || node.selectors.some(isKeyframeSelector)) return;
      const raw = node.raws.selector?.raw || node.selector;
      // Only interpolating '&' needs expansion; standalone nesting keeps its own classes.
      const selectors = /[^\s+>~]&|&[^\s+>~]/.test(node.selector)
        ? resolveNestedSelector(raw, node)
        : [raw];
      for (const selector of selectors) {
        if (!isStandardSelector(selector)) continue;
        try {
          selectorParser()
            .astSync(selector)
            .walkClasses((classNode) => {
              if (!CLASS_PATTERN.test(classNode.value)) {
                const position = node.positionBy({ index: classNode.sourceIndex });
                report(
                  `Invalid CSS class ${String(classNode)}: expected ${CLASS_PATTERN.source}`,
                  position.line,
                  position.column
                );
              }
            });
        } catch (error) {
          report(
            `Cannot parse selector: ${error.message}`,
            node.source.start.line,
            node.source.start.column,
            'selector-parse-error'
          );
        }
      }
    });
  } catch (error) {
    report(error.message, error.line, error.column, 'css-syntax-error');
  }
  return issues;
}

export function lintCssFiles(patterns = CSS_PATTERNS, cwd = process.cwd()) {
  const files = new Set();
  for (const pattern of patterns) {
    const matches = globSync(pattern, { cwd });
    if (matches.length === 0) throw new Error(`No CSS files matched: ${pattern}`);
    for (const match of matches) {
      const file = relative(cwd, resolve(cwd, match)).split(sep).join('/');
      if (!/^src\/(?:options|onboarding|ui)\/.+\.css$/.test(file)) {
        throw new Error(`CSS file outside the governed roots: ${file}`);
      }
      if (file !== IGNORED_FILE) files.add(file);
    }
  }
  const ordered = [...files].sort();
  const issues = ordered.flatMap((file) =>
    lintCssSource(readFileSync(resolve(cwd, file), 'utf8'), file)
  );
  return { files: ordered, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = lintCssFiles(process.argv.slice(2));
    if (result.files.length === 0) throw new Error('No governed CSS files selected');
    for (const issue of result.issues) {
      console.error(`${issue.file}:${issue.line}:${issue.column} ${issue.rule}: ${issue.message}`);
    }
    console.log(`Checked ${result.files.length} CSS files; ${result.issues.length} issues.`);
    process.exitCode = result.issues.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
