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
 * Ships the legal texts inside the production build, so a copy of `dist/` served
 * from any host still carries them: COPYING.txt (the project's AGPL text, read
 * from the root COPYING) and THIRD_PARTY_NOTICES.txt (the license and notice
 * files of every npm package whose code or styles end up in the output — the
 * MIT/ISC/BSD/OFL terms require those texts to travel with the copies).
 *
 * Only modules that actually render into a JS chunk count, so tree-shaken
 * packages are not listed. CSS modules render into a CSS asset instead and
 * report no JS length, so every imported stylesheet is counted too (that is how
 * the self-hosted fonts and Font Awesome get in). Vite bundles each worker in a
 * separate build; the worker plugin feeds its modules into the same set.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const NOTICE_FILE = /^notice(\.(md|txt))?$/i;

/** Package root for a module id inside node_modules, or null for project code. */
export function packageDirOf(id) {
  const file = id.replace(/^\0/, '').split('?')[0].replaceAll('\\', '/');
  const marker = '/node_modules/';
  const at = file.lastIndexOf(marker);
  if (at < 0) return null;
  const segments = file.slice(at + marker.length).split('/');
  const depth = segments[0].startsWith('@') ? 2 : 1;
  if (segments.length <= depth) return null;
  return file.slice(0, at + marker.length) + segments.slice(0, depth).join('/');
}

function readMatching(dir, pattern) {
  return readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), 'utf8').trim());
}

/** Bundled packages, sorted by name; throws when one ships no license text. */
export function collectPackages(moduleIds) {
  const dirs = new Set();
  for (const id of moduleIds) {
    const dir = packageDirOf(id);
    if (dir && existsSync(path.join(dir, 'package.json'))) dirs.add(dir);
  }
  const packages = [...dirs].map((dir) => {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const licenseTexts = readMatching(dir, LICENSE_FILE);
    if (licenseTexts.length === 0) {
      throw new Error(
        `${pkg.name}@${pkg.version} is bundled but ships no license file in ${dir}; ` +
          'add its license text to the notices by hand before shipping it.',
      );
    }
    return {
      name: pkg.name,
      version: pkg.version,
      license: typeof pkg.license === 'string' ? pkg.license : 'see license text',
      texts: [...licenseTexts, ...readMatching(dir, NOTICE_FILE)],
    };
  });
  return packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function renderNotices(packages) {
  const rule = '='.repeat(78);
  const intro = [
    'Third-party software in Dunceious',
    '',
    'Dunceious is licensed under the GNU Affero General Public License v3 or later',
    '(see COPYING.txt). This build also includes the third-party packages below.',
    'Each remains under its own license, reproduced in full; those licenses, not',
    'the AGPL, govern the respective components.',
  ].join('\n');
  const sections = packages.map((p) =>
    [rule, `${p.name} ${p.version} - ${p.license}`, rule, '', p.texts.join('\n\n')].join('\n'),
  );
  return [intro, ...sections].join('\n\n\n') + '\n';
}

function renderedModuleIds(bundle) {
  const ids = [];
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue;
    for (const [id, mod] of Object.entries(output.modules)) {
      if (mod.renderedLength > 0) ids.push(id);
    }
  }
  return ids;
}

/**
 * `main` goes in `plugins`, `worker` in `worker.plugins`. Workers are bundled
 * while the main build transforms, so their modules are collected before the
 * main `generateBundle` writes the notices.
 *
 * @param {{ root: string }} options
 * @returns {{ main: import('vite').Plugin, worker: import('vite').Plugin }}
 */
export function legalNotices({ root }) {
  const workerModuleIds = new Set();
  return {
    main: {
      name: 'dunceious-legal-notices',
      apply: 'build',
      generateBundle(_options, bundle) {
        const stylesheets = [...this.getModuleIds()].filter((id) => /\.css($|\?)/.test(id));
        const ids = [...renderedModuleIds(bundle), ...stylesheets, ...workerModuleIds];
        this.emitFile({
          type: 'asset',
          fileName: 'COPYING.txt',
          source: readFileSync(path.join(root, 'COPYING'), 'utf8'),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'THIRD_PARTY_NOTICES.txt',
          source: renderNotices(collectPackages(ids)),
        });
      },
    },
    worker: {
      name: 'dunceious-legal-notices-worker',
      apply: 'build',
      generateBundle(_options, bundle) {
        for (const id of renderedModuleIds(bundle)) workerModuleIds.add(id);
      },
    },
  };
}
