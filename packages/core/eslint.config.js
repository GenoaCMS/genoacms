import js from '@eslint/js'
import { includeIgnoreFile } from '@eslint/compat'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import { fileURLToPath } from 'node:url'
import ts from 'typescript-eslint'
import neostandard from 'neostandard'
import svelteConfig from './svelte.config.js'
// the monorepo keeps a single .gitignore at the workspace root
const gitignorePath = fileURLToPath(new URL('../../.gitignore', import.meta.url))

export default ts.config(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  neostandard(),
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      // an underscore prefix marks a binding as deliberately unused — used for
      // parameters that exist to document a signature that is not implemented yet
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    ignores: ['eslint.config.js', 'svelte.config.js'],

    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig
      }
    }
  }
)
