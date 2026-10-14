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

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fixture from './fixtures/changelog-release.json';

const script = fileURLToPath(new URL('../changelog-release.mjs', import.meta.url));
let root: string;
let fragments: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'dunceious-changelog-'));
  fragments = path.join(root, 'changes/unreleased');
  mkdirSync(fragments, { recursive: true });
  writeFileSync(path.join(root, 'CHANGELOG.md'), fixture.changelog);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function run(...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}
function fragment(name: string, body: string) {
  writeFileSync(path.join(fragments, name), body);
}
function unchanged() {
  expect(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(fixture.changelog);
}

describe('changelog release CLI', () => {
  it('groups every fragment in category and filename order, preserving pending and released entries', () => {
    for (const [name, body] of Object.entries(fixture.fragments)) fragment(name, body);
    writeFileSync(path.join(fragments, '.gitkeep'), '');
    const result = run('2.9.0', '2026-10-15');
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(
      fixture.changelog.replace('## [2.8.1]', fixture.section + '## [2.8.1]'),
    );
    expect(readdirSync(fragments)).toEqual(['.gitkeep']);
  });

  it('defaults to the current UTC date and omits empty categories', () => {
    fragment('fix.md', fixture.fragments['fix.md']);
    const before = new Date().toISOString().slice(0, 10);
    const result = run('2.9.0');
    const after = new Date().toISOString().slice(0, 10);
    expect(result.status, result.stderr).toBe(0);
    const text = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const release = text.split('## [2.9.0] — ')[1].split('## [2.8.1]')[0];
    expect([before, after]).toContain(release.slice(0, 10));
    expect(release.slice(10)).toBe('\n\n### Fixed\n\n- A corrected behavior.\n\n');
  });

  it.each(fixture.malformed)('rejects malformed fragments without changing any files: %s', body => {
    fragment('a-good.md', fixture.fragments['z-added.md']);
    fragment('z-bad.md', body);
    const result = run('2.9.0', '2026-10-15');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('z-bad.md');
    unchanged();
    expect(readFileSync(path.join(fragments, 'a-good.md'), 'utf8')).toBe(fixture.fragments['z-added.md']);
    expect(readFileSync(path.join(fragments, 'z-bad.md'), 'utf8')).toBe(body);
  });

  it.each([[], ['oops'], ['2.9.0', '2026-02-30'], ['2.9.0', '15-10-2026'], ['2.9.0', '2026-10-15', 'extra']].map(args => ({ args })))(
    'rejects invalid arguments %j without consuming fragments', ({ args }) => {
      fragment('fix.md', fixture.fragments['fix.md']);
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/version|date|Usage/);
      unchanged();
      expect(readdirSync(fragments)).toEqual(['fix.md']);
    },
  );

  it('creates the first release when Unreleased has no history beneath it', () => {
    writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
    fragment('fix.md', fixture.fragments['fix.md']);
    const result = run('2.9.0', '2028-02-29');
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(
      '# Changelog\n\n## [Unreleased]\n\n## [2.9.0] — 2028-02-29\n\n### Fixed\n\n- A corrected behavior.\n\n',
    );
    expect(readdirSync(fragments)).toEqual([]);
  });

  it('rejects a version already present without consuming fragments', () => {
    fragment('fix.md', fixture.fragments['fix.md']);
    const result = run('2.8.1', '2026-10-15');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already');
    unchanged();
    expect(readdirSync(fragments)).toEqual(['fix.md']);
  });

  it('rejects an empty fragment directory without adding a release', () => {
    const result = run('2.9.0', '2026-10-15');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No changelog fragments');
    unchanged();
  });

  it('rejects a missing Unreleased heading without consuming fragments', () => {
    const text = fixture.changelog.replace('## [Unreleased]', '## Pending');
    writeFileSync(path.join(root, 'CHANGELOG.md'), text);
    fragment('fix.md', fixture.fragments['fix.md']);
    const result = run('2.9.0', '2026-10-15');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unreleased');
    expect(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(text);
    expect(readdirSync(fragments)).toEqual(['fix.md']);
  });
});
