/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'no-cross-layer-options-to-content',
      severity: 'warn',
      from: {
        path: '^src/options'
      },
      to: {
        path: '^src/content'
      }
    },
    {
      name: 'no-cross-layer-content-to-options',
      severity: 'warn',
      from: {
        path: '^src/content'
      },
      to: {
        path: '^src/options'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    exclude: {
      path: '^(dist|coverage|tests)(/|$)'
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']
    }
  }
};
