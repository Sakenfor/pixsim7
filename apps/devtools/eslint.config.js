import tseslint from 'typescript-eslint'

export default [
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@features/**', '@lib/**', '@app/**', '@domain/**', '@/**'],
              message:
                'Devtools should import from @pixsim7/* or @devtools/*, not main app aliases.',
            },
          ],
        },
      ],
    },
  },
]
