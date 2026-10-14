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

import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const types = ['Added', 'Changed', 'Fixed', 'Removed', 'Security'];

function release(args) {
  if (args.length < 1 || args.length > 2) {
    throw new Error('Usage: npm run changelog:release -- <version> [YYYY-MM-DD]');
  }
  const [version, date = new Date().toISOString().slice(0, 10)] = args;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Invalid version: expected X.Y.Z (without a v prefix).');
  }
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid date: expected a real calendar date in YYYY-MM-DD format.');
  }

  const changelogPath = path.resolve('CHANGELOG.md');
  const changelog = readFileSync(changelogPath, 'utf8');
  const unreleased = /^## \[Unreleased\][ \t]*\r?$/m.exec(changelog);
  if (!unreleased) throw new Error('CHANGELOG.md must contain ## [Unreleased].');
  if (new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\]`, 'm').test(changelog)) {
    throw new Error(`Version ${version} is already in CHANGELOG.md.`);
  }

  const directory = path.resolve('changes/unreleased');
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.name.endsWith('.md'))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (entries.length === 0) throw new Error('No changelog fragments in changes/unreleased/.');

  // Validate the whole batch before writing or deleting anything, so one bad PR fragment cannot consume others.
  const fragments = entries.map(entry => {
    const filename = path.join(directory, entry.name);
    if (!entry.isFile() || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(entry.name)) {
      throw new Error(`Malformed fragment ${entry.name}: expected a regular <short-slug>.md file.`);
    }
    const match = /^---\r?\ntype:[ \t]*(\w+)[ \t]*\r?\n---\r?\n([\s\S]*)$/.exec(readFileSync(filename, 'utf8'));
    if (!match || !types.includes(match[1])) {
      throw new Error(`Malformed fragment ${entry.name}: front matter must contain type: ${types.join('|')}.`);
    }
    const lines = match[2].trim().split(/\r?\n/);
    if (lines.length > 2 || lines.some(line => !line.trim())) {
      throw new Error(`Malformed fragment ${entry.name}: expected a nonempty one- or two-line body.`);
    }
    return { filename, type: match[1], body: lines.map(line => line.trim()).join(' ') };
  });

  const sections = [`## [${version}] — ${date}`];
  for (const type of types) {
    const group = fragments.filter(fragment => fragment.type === type);
    if (group.length) sections.push(`### ${type}\n\n${group.map(fragment => `- ${fragment.body}`).join('\n')}`);
  }
  const afterHeading = unreleased.index + unreleased[0].length;
  const nextHeading = changelog.slice(afterHeading).search(/^## \[/m);
  const insertion = nextHeading < 0 ? changelog.length : afterHeading + nextHeading;
  const prefix = changelog.slice(0, insertion);
  const separator = prefix.endsWith('\n\n') ? '' : prefix.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(changelogPath, `${prefix}${separator}${sections.join('\n\n')}\n\n${changelog.slice(insertion)}`);
  for (const fragment of fragments) unlinkSync(fragment.filename);
  console.log(`Released ${version} (${date}) from ${fragments.length} changelog fragment(s).`);
}

try {
  release(process.argv.slice(2));
} catch (error) {
  console.error(`changelog-release: ${error.message}`);
  process.exitCode = 1;
}
