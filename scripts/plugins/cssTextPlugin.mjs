import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * esbuild plugin to import CSS files as text strings
 * Allows `import styles from './styles.css?inline';`
 */
export function cssTextPlugin() {
  return {
    name: 'css-text',
    setup(build) {
      build.onResolve({ filter: /\.css\?inline$/ }, (args) => {
        const path = resolve(args.resolveDir ?? __dirname, args.path.replace('?inline', ''));
        return {
          path,
          namespace: 'css-text'
        };
      });

      build.onLoad({ filter: /\.css$/, namespace: 'css-text' }, (args) => {
        const css = readFileSync(args.path, 'utf8');
        const minified = css
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\s+/g, ' ')
          .replace(/\s*([{}:;,])\s*/g, '$1')
          .trim();

        return {
          contents: `export default ${JSON.stringify(minified)};`,
          loader: 'js'
        };
      });
    }
  };
}
