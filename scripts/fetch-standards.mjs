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

// Fetches the pinned standard documents listed in docs/standards/sources.json into
// .cache/standards/ and checks each against its recorded SHA-256. Documents stored in the
// repository are checked in place. A changed pinned document is an error; a changed rolling
// one (a URL that always serves the latest revision) is a warning to re-verify the pin, and a
// dynamic page with no checksum is only reported.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const registryPath = path.resolve('docs/standards/sources.json');
const storedDir = path.resolve('docs/standards/sources');
const cacheDir = path.resolve('.cache/standards');
const refresh = process.argv.includes('--refresh');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const { documents } = JSON.parse(readFileSync(registryPath, 'utf8'));
  mkdirSync(cacheDir, { recursive: true });
  let failed = false;
  for (const doc of documents) {
    const target = path.join(doc.stored ? storedDir : cacheDir, doc.file);
    if (!doc.stored && (refresh || !existsSync(target))) {
      const response = await fetch(doc.url, { redirect: 'follow' });
      if (!response.ok) {
        console.error(`FAIL ${doc.id}: HTTP ${response.status} from ${doc.url}`);
        failed = true;
        continue;
      }
      writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    }
    const digest = sha256(readFileSync(target));
    if (doc.sha256 === null) {
      // Dynamic pages differ on every request, so only the version text can be re-checked.
      console.log(`note ${doc.id}: dynamic page, not checksummed; check it still says ${doc.version}`);
    } else if (digest === doc.sha256) {
      console.log(`ok   ${doc.id} ${doc.version} -> ${path.relative(process.cwd(), target)}`);
    } else if (doc.rolling && !doc.stored) {
      console.warn(`WARN ${doc.id}: upstream changed since the ${doc.version} pin; re-verify the version, then update sources.json`);
    } else {
      console.error(`FAIL ${doc.id}: checksum ${digest} does not match the pinned ${doc.sha256}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
