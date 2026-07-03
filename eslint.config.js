/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // -----------------------------------------------------------------------
      // Architectural size constraints.
      // `max-lines` errors at 600 (skipBlankLines + skipComments) — the hard
      // file ceiling for the layered structure. `max-lines-per-function` stays a
      // warning: React component/render bodies and the `smithWaterman` kernel
      // legitimately exceed a hard function-line cap, so the file-level ceiling
      // is the active hard guard.
      // -----------------------------------------------------------------------
      'max-lines': [
        'error',
        { max: 600, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'warn',
        { max: 80, skipBlankLines: true, skipComments: true },
      ],

      // -----------------------------------------------------------------------
      // Relax pre-existing code-quality issues so Phase 0 does not block CI.
      // These will be tightened during later refactor phases.
      // -----------------------------------------------------------------------
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'prefer-const': 'warn',
      'no-unused-vars': 'off',
    },
  },
  {
    // Plain Node.js scripts in the bench/ and scripts/ directories are not
    // TypeScript and need access to the full set of Node.js globals (process,
    // console, URL, Buffer, etc.).
    files: ['bench/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // --- Layer import boundaries: domain ← core ← workers/handlers ← app ---
  // A layer may import its own layer and layers below it, never above. Upward
  // cross-layer imports are matched by import-specifier string, covering both the
  // `@/…` alias form and relative (`../`) traversals. Tests are exempt.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/src/core/*', '@/src/core/**', '@/core/*', '@/core/**', '**/src/core/**', '**/core/**',
                  '@/src/workers/*', '@/src/workers/**', '@/workers/*', '@/workers/**', '**/src/workers/**', '**/workers/**',
                  '@/src/app/*', '@/src/app/**', '@/app/*', '@/app/**', '**/src/app/**', '**/app/**'],
          message: 'Layer rule: domain may import only domain (not core/workers/app).' },
      ] }],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/src/workers/*', '@/src/workers/**', '@/workers/*', '@/workers/**', '**/src/workers/**', '**/workers/**',
                  '@/src/app/*', '@/src/app/**', '@/app/*', '@/app/**', '**/src/app/**', '**/app/**'],
          message: 'Layer rule: core may import only domain + core (not workers/app).' },
      ] }],
    },
  },
  {
    files: ['src/workers/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/src/app/*', '@/src/app/**', '@/app/*', '@/app/**', '**/src/app/**', '**/app/**'],
          message: 'Layer rule: workers may import domain + core + workers (not app).' },
      ] }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
