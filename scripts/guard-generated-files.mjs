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
 * PreToolUse guard: block hand-edits to generated brand assets.
 *
 * These files are produced by scripts/gen-brand-assets.py and are overwritten on
 * regeneration, so a manual Write/Edit would be silently lost. Reads the hook's
 * JSON payload on stdin (tool_input.file_path) — no jq dependency — and exits 2 to
 * block when the target is one of the generated outputs; exits 0 (allow) otherwise.
 * Any tooling/parse failure falls through to allow, so the guard can never wedge an
 * edit on its own error.
 */
import { readFileSync } from 'node:fs';
import { relative, normalize, isAbsolute } from 'node:path';
import { GENERATED_ASSETS } from './generated-assets.mjs';

const GENERATED = new Set(GENERATED_ASSETS);

let fp = '';
try { fp = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.file_path || ''; } catch { process.exit(0); }
if (!fp) process.exit(0);

const rel = (isAbsolute(fp) ? relative(process.cwd(), fp) : normalize(fp)).split('\\').join('/');
if (GENERATED.has(rel)) {
  console.error(
    `Blocked: ${rel} is a generated brand asset (produced by scripts/gen-brand-assets.py).\n` +
      'Hand-edits are overwritten on regeneration. Edit the generator instead, then run:\n' +
      '  python scripts/gen-brand-assets.py',
  );
  process.exit(2);
}
process.exit(0);
