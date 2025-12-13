import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import importPlugin from 'eslint-plugin-import'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.app.json',
        },
      },
    },
    rules: {
      // Type safety: warn on explicit `any` to encourage proper typing
      // Set to "warn" (not "error") to allow gradual migration
      '@typescript-eslint/no-explicit-any': 'warn',

      // Enforce barrel exports - prevent deep imports
      'import/no-internal-modules': [
        'warn', // Start with warn, can upgrade to error later
        {
          allow: [
            // Packages
            '@pixsim7/**',
            '@shared/**',

            // Assets
            '**/*.css',
            '**/*.scss',
            '**/*.svg',
            '**/*.png',
            '**/*.jpg',
            '**/*.jpeg',
            '**/*.gif',
            '**/*.woff',
            '**/*.woff2',

            // Feature submodules (intentionally exposed for advanced tooling)
            '@features/*/plugins/*',
            '@features/*/lib/*',

            // All lib directories now have barrel exports!
            // Deep imports are no longer allowed - use @lib/* aliases instead
          ],
        },
      ],

      // Import order
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: '@lib/**', group: 'internal', position: 'before' },
            { pattern: '@features/**', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Detect circular dependencies
      'import/no-cycle': ['warn', { maxDepth: 10 }],

      // Ensure imports resolve (but allow type imports to be unresolved for now)
      'import/no-unresolved': ['error', { ignore: ['^@types/'] }],

      // Enforce specific import aliases (Phase 1: Import Standardization)
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features'],
              message: 'Use @features/* instead of @/features/*. Example: import { X } from "@features/controlCenter"',
            },
            {
              group: ['@/lib/*', '@/lib'],
              message: 'Use @lib/* instead of @/lib/*. Example: import { apiClient } from "@lib/api"',
            },
          ],
        },
      ],
    },
  },

  // Test files - allow deep imports
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'import/no-internal-modules': 'off',
    },
  },
])
