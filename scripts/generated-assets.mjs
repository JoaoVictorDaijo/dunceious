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

/*
 * Single source of truth for the brand assets emitted by scripts/gen-brand-assets.py
 * (repo-relative, posix). The PreToolUse guard (guard-generated-files.mjs) blocks
 * hand-edits to these, and scripts/__tests__/generated-assets.test.ts asserts this
 * list stays in sync with what the generator actually writes — so adding a generated
 * asset without listing it here fails loudly instead of slipping past the guard.
 */
export const GENERATED_ASSETS = [
  'public/favicon.svg',
  'public/favicon-32.png',
  'public/apple-touch-icon.png',
  'public/og-image.png',
];
