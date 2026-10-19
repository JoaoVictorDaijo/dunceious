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

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

interface SequenceRecord {
  id: string;
  protein: boolean;
  sequence: string;
}

interface SearchObservation {
  mode: 'exact' | 'fuzzy';
  queryLength: number;
  elapsedMs: number;
  longTasksMs: number[];
}

declare global {
  interface Window {
    realSequenceProbe: {
      dispatches: string[];
      longTasks: number[];
      started: number;
      observer?: PerformanceObserver;
    };
  }
}

/** Every `.gb` file under `directory`, sub-folders included, in a stable order. */
function genbankFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.resolve(directory, entry.name);
    if (entry.isDirectory()) return genbankFiles(file);
    return entry.name.endsWith('.gb') ? [file] : [];
  }).sort();
}

function recordsIn(file: string): SequenceRecord[] {
  return readFileSync(file, 'utf8').split(/^\/\/\s*$/m).flatMap(block => {
    const locus = block.match(/^LOCUS\s+(\S+)\s+(\d+)\s+(bp|aa)\b/m);
    const origin = block.match(/^ORIGIN[^\n]*\n([\s\S]*)/m);
    return locus && origin ? [{
      id: locus[1], protein: locus[3] === 'aa',
      sequence: origin[1].replace(/[^a-z]/gi, '').toUpperCase(),
    }] : [];
  });
}

const examples = genbankFiles('examples');
const external = process.env.PLAYWRIGHT_SEQUENCE_DIR;
const extraFiles = external ? genbankFiles(external) : [];
const scenarios = [
  ...examples.map(file => ({ name: `examples/${path.relative('examples', file)}`, files: [file] })),
  ...extraFiles.map(file => ({ name: `external/${path.basename(file)}`, files: [file] })),
  ...(extraFiles.length ? [{ name: 'external/combined', files: extraFiles }] : []),
];

for (const scenario of scenarios) {
  test(`real sequences remain searchable at reduced CPU speed: ${scenario.name}`, async ({ page, context }, testInfo) => {
    const errors: string[] = [];
    const observations: SearchObservation[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.realSequenceProbe = { dispatches: [], longTasks: [], started: 0 };
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message, ...args) {
        if (message?.mode) window.realSequenceProbe.dispatches.push(message.mode);
        return original.call(this, message, ...args);
      };
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto('/');
    await page.getByRole('button', { name: /Annotation Hub$/ }).click();
    const records = scenario.files.flatMap(recordsIn);
    expect(records.length).toBeGreaterThan(0);
    const first = records[0];
    await page.getByLabel('Import sequences files', { exact: true }).setInputFiles(scenario.files);
    await expect(page.getByRole('button', { name: /^Jump to sequence / })).toHaveCount(records.length);
    await page.getByRole('button', { name: /^Open .* in viewport$/ }).first().click();
    await expect(page.locator('path[data-annotation-part]')).not.toHaveCount(0);

    async function search(mode: 'exact' | 'fuzzy', query: string, expectedRange?: [number, number], recordId = first.id) {
      await page.getByRole('button', { name: mode === 'exact' ? 'IUPAC' : 'Fuzzy', exact: true }).click();
      await page.getByPlaceholder(mode === 'exact' ? 'Enter IUPAC sequence...' : 'Enter query sequence...').fill(query);
      await page.evaluate(() => {
        const probe = window.realSequenceProbe;
        probe.longTasks = [];
        probe.observer = new PerformanceObserver(list => probe.longTasks.push(...list.getEntries().map(entry => entry.duration)));
        probe.observer.observe({ type: 'longtask' });
        probe.started = performance.now();
      });
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      if (expectedRange) {
        await expect(page.getByRole('button', {
          name: `Annotate match ${expectedRange[0]}–${expectedRange[1]} in ${recordId}`, exact: true,
        }).first()).toBeVisible();
      } else {
        await expect(page.getByText('100 matches', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Annotate match / })).toHaveCount(100);
      }
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const timing = await page.evaluate(() => {
        const probe = window.realSequenceProbe;
        probe.observer?.disconnect();
        return { elapsedMs: performance.now() - probe.started, longTasksMs: probe.longTasks };
      });
      observations.push({ mode, queryLength: query.length, ...timing });
      expect(await page.evaluate(() => window.realSequenceProbe.dispatches)).toContain(mode);
      await page.getByRole('button', { name: 'Clear search', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Annotate match / })).toHaveCount(0);
    }

    try {
      const length = Math.min(300, Math.floor(first.sequence.length / 2));
      const start = Math.floor(first.sequence.length / 3);
      const query = first.sequence.slice(start, start + length);
      // Matched by file name so the check survives examples/ being reorganized into sub-folders.
      const clearedLimit = scenario.name.startsWith('examples/') && path.basename(scenario.files[0]) === 'arabidopsis-chloroplast-NC_000932.gb';
      const resultLimit = page.locator('[data-sequence-search-section] input[type=number]');
      if (clearedLimit) await resultLimit.fill('');
      await search('exact', query, [start, start + length]);
      if (clearedLimit) await expect(resultLimit).toHaveValue('100');
      if (!first.protein) {
        const alphabet: Record<string, string> = { A: first.sequence.includes('T') ? 'T' : 'U', T: 'A', U: 'A', C: 'G', G: 'C' };
        await page.locator('[data-sequence-search-section] select').selectOption('rev');
        await search('exact', [...query].reverse().map(base => alphabet[base] ?? base).join(''), [start, start + length]);
        await page.locator('[data-sequence-search-section] select').selectOption('both');
      }
      const mutated = [...query];
      for (const position of [Math.floor(length / 4), Math.floor(length / 2), Math.floor(length * 3 / 4)]) {
        mutated[position] = mutated[position] === 'A' ? 'C' : 'A';
      }
      await search('fuzzy', mutated.join(''), [start, start + length]);
      await search('exact', first.protein ? 'X' : 'N');
      for (const record of records.slice(1)) {
        const offset = Math.floor(record.sequence.length / 3);
        const subsequence = record.sequence.slice(offset, offset + Math.min(300, Math.floor(record.sequence.length / 2)));
        await search('exact', subsequence, [offset, offset + subsequence.length], record.id);
      }
      expect(errors).toEqual([]);
    } finally {
      await testInfo.attach('real-sequence-observations', {
        body: JSON.stringify({ files: scenario.files.map(file => path.basename(file)), records: records.length,
          lengths: records.map(record => record.sequence.length), cpuThrottleRate: 4, observations, errors }, null, 2),
        contentType: 'application/json',
      });
    }
  });
}
