/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
 * A header without the copyright line also fails: headers written before the
 * holders were named would otherwise pass forever, and the AGPL asks every
 * source file to carry its copyright notice. `--fix` adds the line to them.
 *
 * Covered: .ts .tsx .js .mjs .cjs .css (block) / .html .svg (xml) /
 *          .py .yml .yaml .sh + .gitignore (hash).
 * Exempt (cannot or by convention): .json (no comments), .md, binary assets,
 *        pnpm-lock.yaml.
 * Only git-tracked files are considered.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, basename, resolve, relative } from 'node:path';

const MARKER = 'GNU Affero General Public License';

const BODY = [
  'Dunceious',
  'Copyright (C) 2026 João Victor Daijo and Murilo Cassiano',
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
const COPYRIGHT = BODY[1];
// The header's first text line, as each comment style renders it (` * Dunceious`, `# Dunceious`, `  Dunceious`).
const TITLE_LINE = /^(\s*\*\s|#\s|\s+)Dunceious\s*$/;

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

// pnpm rewrites its lockfile on every install and drops any comment in it.
const EXEMPT_NAMES = new Set(['pnpm-lock.yaml']);

const styleFor = (file) =>
  EXEMPT_NAMES.has(basename(file)) ? null : EXT_STYLE[extname(file)] || NAME_STYLE[basename(file)] || null;

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
const offenders = []; // no header
const stale = []; // header without the copyright line
const unfixable = []; // header too unusual for --fix to place the line

for (const file of files) {
  const style = styleFor(file);
  if (!style) continue; // not a covered type
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { continue; }
  // Only treat the marker as a header when it appears at the TOP of the file, so a
  // file that legitimately contains the license text as data (this checker, or the
  // asset generator that emits it) is not mistaken for already-headered.
  const lines = content.split('\n');
  const top = lines.slice(0, 25);
  if (top.join('\n').includes(MARKER)) {
    if (top.some((l) => l.includes(COPYRIGHT))) continue;
    const title = top.findIndex((l) => TITLE_LINE.test(l));
    if (title < 0) {
      unfixable.push(file);
      continue;
    }
    stale.push(file);
    if (!fix) continue;
    const prefix = lines[title].match(TITLE_LINE)[1];
    lines.splice(title + 1, 0, prefix + COPYRIGHT);
    writeFileSync(file, lines.join('\n'));
    continue;
  }
  offenders.push(file);
  if (!fix) continue;

  const at = insertionIndex(lines, extname(file));
  const pre = at > 0 ? lines.slice(0, at).join('\n') + '\n' : '';
  const tail = lines.slice(at).join('\n');
  writeFileSync(file, pre + renderers[style]() + '\n' + tail);
}

const list = (fs) => fs.map((f) => '  ' + f).join('\n');

if (fix) {
  if (offenders.length) console.log(`Added AGPL header to ${offenders.length} file(s):\n` + list(offenders));
  if (stale.length) console.log(`Added the copyright line to ${stale.length} file(s):\n` + list(stale));
  if (!offenders.length && !stale.length && !unfixable.length && !hookMode) {
    console.log('All covered files already carry the AGPL header.');
  }
}
if (unfixable.length) {
  console.error(
    `AGPL header without "${COPYRIGHT}" in ${unfixable.length} file(s), ` +
      'and no "Dunceious" title line to place it after; add it by hand:\n' +
      list(unfixable),
  );
  if (!hookMode) process.exit(1);
}
if (fix) process.exit(0);
if (offenders.length || stale.length) {
  if (offenders.length) console.error(`Missing AGPL license header in ${offenders.length} file(s):\n` + list(offenders));
  if (stale.length) console.error(`AGPL header without "${COPYRIGHT}" in ${stale.length} file(s):\n` + list(stale));
  console.error('\nFix with: node scripts/check-license-headers.mjs --fix');
  process.exit(1);
}
console.log(`License-header check passed: all ${files.filter(styleFor).length} covered files carry the AGPL header.`);
