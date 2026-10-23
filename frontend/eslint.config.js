import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // <Icon /> counts as a use of Icon
      'react/jsx-uses-vars': 'error',
      // a context file exports its provider and its hook
      'react-refresh/only-export-components': ['warn', { allowExportNames: ['useTheme'] }],
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'vite.config.js', 'vitest.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
])
