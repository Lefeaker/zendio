module.exports = {
  rules: {},
  overrides: [
    {
      files: ['src/options/styles/**/*.css'],
      rules: {
        'selector-class-pattern': [
          '^(?!aob-)[a-z0-9_-]+$',
          {
            message: 'Options CSS 禁止使用 legacy `.aob-*` 前缀',
            resolveNestedSelectors: true
          }
        ]
      }
    }
  ]
};
