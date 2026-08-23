import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = (path) => readFileSync(join(root, path), 'utf8');
const checks = [
  ['src/ui/stitch-runtime/surfaceComponents.ts', "from '../primitives/button'"],
  ['src/ui/stitch-runtime/surfaceComponents.ts', "from '../primitives/input'"],
  ['src/ui/stitch-runtime/surfaceComponents.ts', "from '../primitives/textarea'"],
  ['src/options/stitch/ui/components.ts', "from '@ui/primitives/button'"],
  ['src/options/stitch/ui/components.ts', "from '@ui/primitives/card'"],
  ['src/options/stitch/ui/components.ts', "from '@ui/primitives/select'"],
  ['src/options/stitch/ui/components.ts', "from '@ui/primitives/table'"],
  ['src/options/stitch/ui/components.ts', "from '@ui/primitives/toggle'"]
];
const failures = checks.filter(([path, expected]) => !source(path).includes(expected)).map(([path, expected]) => `${path}: missing ${expected}`);
const surface = source('src/ui/stitch-runtime/surfaceComponents.ts');
if (/surfaceComponents = \{[^}]*\b(?:Select|Card)\b/s.test(surface)) failures.push('surfaceComponents must not expand Select/Card');
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
