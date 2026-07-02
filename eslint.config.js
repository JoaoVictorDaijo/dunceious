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
      // Architectural size constraints — Phase 0 safety nets.
      // Files / functions that already violate these limits are flagged as
      // warnings so CI stays green while future refactor phases bring them
      // under control.  The hard-error level (600 / 120) will be activated
      // once Phase 2-3 refactoring is complete.
      //
      //   warn  -> file > 400 lines  (skipBlanks + skipComments)
      //   error -> file > 600 lines  (not yet active -- see above)
      // -----------------------------------------------------------------------
      'max-lines': [
        'warn',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      //   warn  -> function > 80 lines
      //   error -> function > 120 lines  (not yet active)
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
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
