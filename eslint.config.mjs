// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '*.js', '*.mjs', 'scripts/**/*', 'prisma/**/*', 'routes/**/*.js', 'middleware/**/*.js', 'services/**/*.js', 'db/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json']
      }
    },
    rules: {
      // TypeScript essentials
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // General JS/TS
      'no-console': 'off',
      'no-useless-catch': 'warn',
      'no-var': 'error',
      'prefer-const': 'warn',
      'eqeqeq': 'error',
      'no-eval': 'error'
    }
  }
);