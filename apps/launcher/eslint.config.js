import tseslint from 'typescript-eslint'

// Minimal scaffold so lint-staged has something to run via the pre-commit
// hook. No rules enabled yet — add them incrementally as conventions solidify.
// The launcher app is small and self-contained; broad ruleset adoption (à la
// apps/main/eslint.config.js) isn't justified yet.
export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {},
  },
]
