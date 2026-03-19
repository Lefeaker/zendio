#!/usr/bin/env node

/**
 * Lint script to detect hardcoded configuration values
 * This helps prevent regression of the P2-1 hardcoded config remediation
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Patterns to detect hardcoded values
const HARDCODED_PATTERNS = [
  {
    pattern: /127\.0\.0\.1:271[23]4?/g,
    message: 'Hardcoded REST endpoint found. Use configProvider.getRestDefaults() instead.',
    severity: 'error',
    allowedFiles: ['dynamicMessages.test.ts', 'configProvider.test.ts', 'manifestHosts.test.ts', 'ports.test.ts']
  },
  {
    pattern: /['"`]https?:\/\/127\.0\.0\.1:271[23]4?/g,
    message: 'Hardcoded REST URL found. Use configProvider.getRestDefaults() instead.',
    severity: 'error',
    allowedFiles: ['manifestHosts.test.ts', 'ports.test.ts']
  },
  {
    pattern: /:\s*271[23]4?\b/g,
    message: 'Hardcoded port number found. Use configProvider.getRestDefaults() instead.',
    severity: 'error',
    allowedFiles: ['appConfig.ts', 'dynamicMessages.test.ts', 'configProvider.test.ts', 'manifestHosts.test.ts', 'ports.test.ts']
  },
  {
    pattern: /['"`]AllInObsidian['"`]/g,
    message: 'Hardcoded vault name found. Use configProvider.getRestDefaults().vault instead.',
    severity: 'warning',
    allowedFiles: ['appConfig.ts', 'configProvider.test.ts']
  },
  {
    pattern: /Fragments\/\{yyyy\}\/\{mm\}\/\{dd\}/g,
    message: 'Hardcoded template path found. Use configProvider.getTemplates() instead.',
    severity: 'warning',
    allowedFiles: ['appConfig.ts', 'configProvider.test.ts']
  },
  {
    pattern: /Articles\/\{domain\}\/\{yyyy\}/g,
    message: 'Hardcoded template path found. Use configProvider.getTemplates() instead.',
    severity: 'warning',
    allowedFiles: ['appConfig.ts', 'configProvider.test.ts', 'readingTemplateControls.test.ts', 'resolvePath.test.ts', 'index.html']
  }
];

// Files and directories to exclude from linting
const EXCLUDED_PATHS = [
  'node_modules',
  'dist',
  'releases',
  '.git',
  'tmp',
  'tests/fixtures',
  'tests/e2e', // E2E tests may use hardcoded test values
  'scripts/lint-hardcoded-values.mjs' // This file itself
];

// File extensions to check
const CHECKED_EXTENSIONS = ['.ts', '.js', '.mjs', '.json', '.html'];

class HardcodedValueLinter {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  async lintDirectory(dirPath, relativePath = '') {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const relativeEntryPath = join(relativePath, entry);
      
      // Skip excluded paths
      if (EXCLUDED_PATHS.some(excluded => relativeEntryPath.includes(excluded))) {
        continue;
      }
      
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        await this.lintDirectory(fullPath, relativeEntryPath);
      } else if (stats.isFile() && CHECKED_EXTENSIONS.includes(extname(entry))) {
        await this.lintFile(fullPath, relativeEntryPath);
      }
    }
  }

  async lintFile(filePath, relativePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1;
        
        for (const { pattern, message, severity, allowedFiles = [] } of HARDCODED_PATTERNS) {
          // Skip if this file is in the allowed list for this pattern
          if (allowedFiles.some(allowed => relativePath.includes(allowed))) {
            continue;
          }
          
          const matches = line.matchAll(pattern);
          for (const match of matches) {
            const issue = {
              file: relativePath,
              line: lineNumber,
              column: match.index + 1,
              message,
              severity,
              match: match[0]
            };
            
            if (severity === 'error') {
              this.errors.push(issue);
            } else {
              this.warnings.push(issue);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read file ${relativePath}: ${error.message}`);
    }
  }

  printResults() {
    const totalIssues = this.errors.length + this.warnings.length;
    
    if (totalIssues === 0) {
      console.log('✅ No hardcoded configuration values found!');
      return true;
    }
    
    console.log(`\n🔍 Found ${totalIssues} potential hardcoded configuration issues:\n`);
    
    // Print errors
    if (this.errors.length > 0) {
      console.log(`❌ Errors (${this.errors.length}):`);
      for (const error of this.errors) {
        console.log(`  ${error.file}:${error.line}:${error.column}`);
        console.log(`    ${error.message}`);
        console.log(`    Found: "${error.match}"`);
        console.log('');
      }
    }
    
    // Print warnings
    if (this.warnings.length > 0) {
      console.log(`⚠️  Warnings (${this.warnings.length}):`);
      for (const warning of this.warnings) {
        console.log(`  ${warning.file}:${warning.line}:${warning.column}`);
        console.log(`    ${warning.message}`);
        console.log(`    Found: "${warning.match}"`);
        console.log('');
      }
    }
    
    console.log('💡 Tip: Use configProvider.getRestDefaults(), configProvider.getTemplates(), etc. instead of hardcoded values.');
    
    return this.errors.length === 0; // Return true only if no errors (warnings are OK)
  }
}

async function main() {
  console.log('🔍 Scanning for hardcoded configuration values...\n');
  
  const linter = new HardcodedValueLinter();
  
  // Lint source code
  await linter.lintDirectory(join(projectRoot, 'src'));
  
  // Lint tests (but exclude fixtures and e2e)
  await linter.lintDirectory(join(projectRoot, 'tests/unit'));
  
  const success = linter.printResults();
  
  if (!success) {
    console.log('\n❌ Linting failed due to hardcoded configuration values.');
    console.log('Please replace hardcoded values with configProvider calls.');
    process.exit(1);
  }
  
  console.log('\n✅ Hardcoded value linting passed!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Error running hardcoded value linter:', error);
    process.exit(1);
  });
}
