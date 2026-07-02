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
 * Enforces the project rule: every covered source file must begin with the AGPL
 * license header. Default mode checks and exits non-zero on any offender (used in
 * CI). `--fix` inserts the header (after a shebang / <!DOCTYPE> / <?xml?> line).
 *
 * Covered: .ts .tsx .js .mjs .cjs .css (block) / .html .svg (xml) /
 *          .py .yml .yaml .sh + .gitignore (hash).
 * Exempt (cannot or by convention): .json (no comments), .md, binary assets.
 * Only git-tracked files are considered.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, basename, resolve, relative } from 'node:path';

const MARKER = 'GNU Affero General Public License';

const BODY = [
  'Dunceious',
  '',
  'This file is part of Dunceious.',
  '',
  'Dunceious is free software: you can redistribute it and/or modify',
  'it under the terms of the GNU Affero General Public License as published by',
  'the Free Software Foundation, either version 3 of the License, or',
  '(at your option) any later version.',
  '',
  'Dunceious is distributed in the hope that it will be useful,',
  'but WITHOUT ANY WARRANTY; without even the implied warranty of',
  'MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the',
  'GNU Affero General Public License for more details.',
  '',
  'You should have received a copy of the GNU Affero General Public License',
  'along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.',
];

const renderers = {
  block: () => '/*\n' + BODY.map((l) => (l ? ` * ${l}` : ' *')).join('\n') + '\n */\n',
  hash: () => '#\n' + BODY.map((l) => (l ? `# ${l}` : '#')).join('\n') + '\n#\n',
  xml: () => '<!--\n' + BODY.map((l) => (l ? `  ${l}` : '')).join('\n') + '\n-->\n',
};

const EXT_STYLE = {
  '.ts': 'block', '.tsx': 'block', '.js': 'block', '.mjs': 'block', '.cjs': 'block', '.css': 'block',
  '.html': 'xml', '.svg': 'xml',
  '.py': 'hash', '.yml': 'hash', '.yaml': 'hash', '.sh': 'hash',
};
const NAME_STYLE = { '.gitignore': 'hash' };

const styleFor = (file) => EXT_STYLE[extname(file)] || NAME_STYLE[basename(file)] || null;

/** First line index at which the header may be inserted (after shebang/doctype/xml decl). */
function insertionIndex(lines, ext) {
  if ((lines[0] || '').startsWith('#!')) return 1;
  if (ext === '.html') {
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      if (/^\s*<!doctype/i.test(lines[i])) return i + 1;
    }
  }
  if ((ext === '.svg' || ext === '.xml') && /^\s*<\?xml/i.test(lines[0] || '')) return 1;
  return 0;
}

// No path args -> scan every tracked file (CI / full sweep).
// Path args     -> only those files, restricted to inside the repo.
// --hook        -> read the PostToolUse JSON on stdin and fix the file it names
//                  (may be untracked, so `git ls-files` can't see it). Reading
//                  stdin here avoids any dependency on jq, which isn't always installed.
const rawArgs = process.argv.slice(2);
const hookMode = rawArgs.includes('--hook');
const fix = hookMode || rawArgs.includes('--fix');
let pathArgs = rawArgs.filter((a) => a !== '--fix' && a !== '--hook');

if (hookMode) {
  let fp = '';
  try { fp = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.file_path || ''; } catch { /* not a hook payload */ }
  if (!fp) process.exit(0);
  pathArgs = [fp];
}

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const files = pathArgs.length
  ? pathArgs
      .map((p) => resolve(p))
      .filter((abs) => abs === repoRoot || abs.startsWith(repoRoot + '/'))
      .map((abs) => relative(repoRoot, abs))
  : execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const offenders = [];

for (const file of files) {
  const style = styleFor(file);
  if (!style) continue; // not a covered type
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { continue; }
  // Only treat the marker as a header when it appears at the TOP of the file, so a
  // file that legitimately contains the license text as data (this checker, or the
  // asset generator that emits it) is not mistaken for already-headered.
  if (content.split('\n').slice(0, 25).join('\n').includes(MARKER)) continue;
  offenders.push(file);
  if (!fix) continue;

  const lines = content.split('\n');
  const at = insertionIndex(lines, extname(file));
  const pre = at > 0 ? lines.slice(0, at).join('\n') + '\n' : '';
  const tail = lines.slice(at).join('\n');
  writeFileSync(file, pre + renderers[style]() + '\n' + tail);
}

if (fix) {
  if (offenders.length) {
    console.log(`Added AGPL header to ${offenders.length} file(s):\n` + offenders.map((f) => '  ' + f).join('\n'));
  } else if (!hookMode) {
    console.log('All covered files already carry the AGPL header.');
  }
} else if (offenders.length) {
  console.error(
    `Missing AGPL license header in ${offenders.length} file(s):\n` +
      offenders.map((f) => '  ' + f).join('\n') +
      '\n\nFix with: node scripts/check-license-headers.mjs --fix',
  );
  process.exit(1);
} else {
  console.log(`License-header check passed: all ${files.filter(styleFor).length} covered files carry the AGPL header.`);
}
