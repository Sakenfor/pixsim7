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
            '**/*.json',

            // Feature submodules (intentionally exposed for advanced tooling)
            '@features/*/plugins/*',
            '@features/*/lib/*',

            // Local imports & common deep externals
            './**',
            '../**',
            '@/components/**',
            '@/types/**',
            '@/data/**',
            'zustand/**',

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
      // NOTE: Downgraded to warn due to path alias resolution issues in lint-staged
      'import/no-unresolved': ['warn', { ignore: ['^@types/'] }],

      // Enforce specific import aliases (Phase 1: Import Standardization)
      // NOTE: Downgraded to warn to allow gradual migration
      'no-restricted-imports': [
        'warn',
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
            {
              group: [
                '@features/generation/lib/core/assetInputTypes',
                '@features/generation/lib/core/normalizeProviderParams',
                '@features/generation/lib/generationTypes',
              ],
              message: 'Import from @pixsim7/shared.generation-core instead of legacy @features/generation paths.',
            },
            {
              group: [
                '@features/assets/lib/assetMediaType',
                '@features/assets/lib/assetCardActions',
              ],
              message: 'Import from @pixsim7/shared.assets-core instead of legacy @features/assets paths.',
            },
            {
              group: ['@features/contextHub/types'],
              importNames: ['CapabilityKey', 'CapabilityProvider', 'CapabilitySnapshot', 'CapabilityScope'],
              message: 'Import core capability types from @pixsim7/capabilities-core instead of @features/contextHub.',
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
      'import/no-unresolved': ['error', { ignore: ['^@types/', '^vitest$'] }],
    },
  },

  // Hook naming convention - only for files named use*.ts (actual hook files)
  // This avoids false positives on helper functions within hooks directories
  {
    files: ['**/hooks/**/use*.{ts,tsx}', '**/use*.hook.{ts,tsx}'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'function',
          modifiers: ['exported'],
          format: ['camelCase'],
          custom: {
            regex: '^use[A-Z]',
            match: true,
          },
        },
      ],
    },
  },

  // Restrict global store imports from feature code
  // Features should use feature-local stores or pass via props/context
  {
    files: ['**/features/**/*.{ts,tsx}'],
    rules: {
      // Feature internals routinely use deep/relative imports; allow them here.
      'import/no-internal-modules': 'off',
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@/stores/*', '../../../stores/*', '../../../../stores/*'],
              message:
                'Features should not import global stores directly. Use feature-local stores or pass via props/context.',
            },
          ],
        },
      ],
    },
  },
])
