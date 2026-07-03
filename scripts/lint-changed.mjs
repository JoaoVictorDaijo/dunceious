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
 * PostToolUse fast feedback: run ESLint (errors only) on the file just written.
 *
 * Surfaces the hard-error rules — the layer-import boundaries and the max-lines
 * ceiling — at edit time instead of waiting for CI. Reads the hook's JSON payload
 * on stdin (tool_input.file_path); runs `eslint --quiet` (the intentional warnings
 * stay silent) on in-repo TS/JS sources only; exits 2 to hand any errors back to the
 * agent. Missing binary or a linter fatal is non-blocking (exit 0) so tooling
 * trouble never stalls an edit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, isAbsolute, extname, normalize } from 'node:path';

const LINTABLE = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

let fp = '';
try { fp = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.file_path || ''; } catch { process.exit(0); }
if (!fp || !LINTABLE.has(extname(fp))) process.exit(0);

const cwd = process.cwd();
const rel = (isAbsolute(fp) ? relative(cwd, fp) : normalize(fp)).split('\\').join('/');
if (!rel || rel.startsWith('../') || rel.startsWith('dist/') || rel.startsWith('node_modules/')) process.exit(0);

const eslintBin = join(cwd, 'node_modules', '.bin', 'eslint');
if (!existsSync(eslintBin)) process.exit(0);

try {
  execFileSync(eslintBin, ['--quiet', rel], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.exit(0);
} catch (err) {
  // eslint exit 1 = lint errors found → surface them; anything else (e.g. 2 = a
  // linter fatal) is tooling trouble and must not block the agent.
  if (err.status === 1) {
    console.error((err.stdout || '') + (err.stderr || ''));
    process.exit(2);
  }
  process.exit(0);
}
