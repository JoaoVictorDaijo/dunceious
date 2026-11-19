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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './fixtures';

// Same element touch.spec.ts reads: the viewer's native horizontal scroll container.
const horizontalSelector = 'div.overflow-x-auto.overflow-y-hidden';

/**
 * Opt-in timings of one session's steps (load, annotate, align, search, pan) in the production build
 * at native CPU speed, on the bundled phage sets and on synthetic alignments of growing size.
 * Each step runs from the DOM event that starts it to the second animation frame after the last
 * file read or worker message, once every file read and every bio or search request has finished
 * and nothing has happened for QUIET_MS. Local search streams its results, so it ends at the second
 * frame after the panel shows "Search done". Set SESSION_TIMINGS=1 to run it.
 */
const RUNS = Number(process.env.SESSION_TIMINGS_RUNS ?? 5);
const QUIET_MS = 400;
const OUT = process.env.SESSION_TIMINGS_OUT ?? 'test-results/session-timings';

declare global {
  interface Window {
    timingProbe: { t0: number; armed: boolean; lastActivity: number; painted: number; pending: number; doneSeen: number; panStep?: Promise<{ ms: number; moved: number }> };
  }
}

interface Dataset {
  sequences: string[];
  annotations?: string;
  alignment?: string;
  rows: number;
  columns: number | null;
  features: number | null;
  query: string;
}

/** Deterministic generator (mulberry32) so the synthetic inputs are the same on every run. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(sequence: string) { return sequence.match(/.{1,60}/g)!.join('\n'); }

/** Rows derived from one random genome: 2% substitutions and five deletions of 1–30 bases per row; row 1 is the genome. */
function synthetic(rows: number, length: number, directory: string): Dataset {
  const random = prng(rows * 1000003 + length);
  const bases = 'ACGT';
  const genome = Array.from({ length }, () => bases[Math.floor(random() * 4)]);
  const aligned: string[] = [];
  const raw: string[] = [];
  const gff = ['##gff-version 3'];
  for (let row = 0; row < rows; row++) {
    const cells = [...genome];
    if (row > 0) {
      for (let i = 0; i < length; i++) if (random() < 0.02) cells[i] = bases[(bases.indexOf(cells[i]) + 1 + Math.floor(random() * 3)) % 4];
      for (let deletion = 0; deletion < 5; deletion++) {
        const start = Math.floor(random() * (length - 40));
        const size = 1 + Math.floor(random() * 30);
        for (let i = start; i < start + size; i++) cells[i] = '-';
      }
    }
    const id = `syn${String(row + 1).padStart(3, '0')}`;
    const ungapped = cells.join('').replaceAll('-', '');
    aligned.push(`>${id}\n${wrap(cells.join(''))}`);
    raw.push(`>${id}\n${wrap(ungapped)}`);
    for (let gene = 0; gene < 30; gene++) {
      const start = 1 + gene * 900;
      const end = Math.min(start + 799, ungapped.length);
      gff.push([id, 'synthetic', 'gene', start, end, '.', gene % 2 ? '-' : '+', '.', `ID=${id}_g${gene + 1};Name=gene${gene + 1}`].join('\t'));
    }
  }
  mkdirSync(directory, { recursive: true });
  const base = path.join(directory, `syn-${rows}x${length}`);
  writeFileSync(`${base}.fasta`, `${raw.join('\n')}\n`);
  writeFileSync(`${base}.aligned.fasta`, `${aligned.join('\n')}\n`);
  writeFileSync(`${base}.gff3`, `${gff.join('\n')}\n`);
  return { sequences: [`${base}.fasta`], annotations: `${base}.gff3`, alignment: `${base}.aligned.fasta`,
    rows, columns: length, features: rows * 30, query: mutate(genome.slice(10000, 10300).join('')) };
}

/** Three substitutions, as in realSequences.spec.ts, so the fuzzy modes have edits to find. */
function mutate(query: string) {
  const out = [...query];
  for (const position of [75, 150, 225]) out[position] = out[position] === 'A' ? 'C' : 'A';
  return out.join('');
}

function origin(file: string) {
  return readFileSync(file, 'utf8').match(/^ORIGIN[^\n]*\n([\s\S]*?)^\/\//m)![1].replace(/[^a-z]/gi, '').toUpperCase();
}

function featureCount(files: string[]) {
  return files.reduce((sum, file) => sum + [...readFileSync(file, 'utf8').matchAll(/^ {5}(?!source\b)[A-Za-z_']+ +\S/gm)].length, 0);
}

function fastaWidth(file: string) {
  return readFileSync(file, 'utf8').split('>')[1].split('\n').slice(1).join('').length;
}

const t7 = ['phage-t7-NC_001604.gb', 'phage-13a-NC_011045.gb', 'phage-t3-NC_003298.gb'].map(file => `examples/nucleotide/t7-phages/${file}`);
const t4 = ['phage-t4-NC_000866.gb', 'phage-t6-NC_054907.gb', 'phage-kha5h-NC_054905.gb'].map(file => `examples/nucleotide/t4-phages/${file}`);

// Inputs are read and generated inside the test that uses them: Playwright evaluates this file when
// it lists tests, and a skipped run must not touch the disk.
const scratch = path.join(OUT, 'inputs');
const datasets: { name: string; build: () => Dataset }[] = [
  { name: 'T7-like phages', build: () => ({ sequences: t7, alignment: 'examples/nucleotide/t7-phages/aligned.fasta', rows: 3,
    columns: fastaWidth('examples/nucleotide/t7-phages/aligned.fasta'), features: featureCount(t7), query: mutate(origin(t7[0]).slice(13000, 13300)) }) },
  { name: 'T4-like phages (not aligned)', build: () => ({ sequences: t4, rows: 3, columns: null, features: featureCount(t4),
    query: mutate(origin(t4[0]).slice(56000, 56300)) }) },
  ...[10, 50, 100].map(rows => ({ name: `synthetic ${rows} x 30000`, build: () => synthetic(rows, 30000, scratch) })),
];

async function probe(page: Page) {
  await page.addInitScript(() => {
    const state = { t0: 0, armed: false, lastActivity: 0, painted: 0, pending: 0, doneSeen: 0 };
    // Bio and search workers answer each request once; local-search workers stream, so they are not counted.
    const counted = new WeakSet<Worker>();
    window.timingProbe = state;
    const paint = () => requestAnimationFrame(() => requestAnimationFrame(() => { state.painted = performance.now(); }));
    const NativeWorker = window.Worker;
    const post = NativeWorker.prototype.postMessage;
    NativeWorker.prototype.postMessage = function(this: Worker, ...args: unknown[]) {
      state.lastActivity = performance.now();
      const message = args[0] as { type?: unknown; mode?: unknown } | null;
      if (message && ((typeof message.type === 'string' && /^[A-Z_]+$/.test(message.type)) || typeof message.mode === 'string')) {
        counted.add(this);
        state.pending++;
      }
      return (post as (...a: unknown[]) => void).apply(this, args);
    } as typeof post;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const worker = new target(...(args as [string | URL, WorkerOptions?]));
        worker.addEventListener('message', () => {
          state.lastActivity = performance.now();
          if (counted.has(worker)) state.pending = Math.max(0, state.pending - 1);
          paint();
        });
        return worker;
      },
    });
    // An import reads its files before any worker hears of it; without this a slow read looks like silence.
    for (const method of ['readAsText', 'readAsArrayBuffer', 'readAsDataURL', 'readAsBinaryString'] as const) {
      const read = FileReader.prototype[method] as (this: FileReader, blob: Blob, ...rest: string[]) => void;
      FileReader.prototype[method] = function(this: FileReader, blob: Blob, ...rest: string[]) {
        state.lastActivity = performance.now();
        state.pending++;
        this.addEventListener('loadend', () => {
          state.lastActivity = performance.now();
          state.pending = Math.max(0, state.pending - 1);
          paint();
        }, { once: true });
        return read.call(this, blob, ...rest);
      };
    }
    const start = () => { if (state.armed) { state.armed = false; state.t0 = performance.now(); state.lastActivity = state.t0; state.painted = 0; state.doneSeen = 0; paint(); } };
    document.addEventListener('change', start, true);
    document.addEventListener('click', start, true);
  });
}

/** Arms the probe, runs the action, and returns the time to the frame after the step's last activity. */
async function timed(page: Page, action: () => Promise<void>, timeout = 180_000, doneText: string | null = null): Promise<number> {
  await page.evaluate(() => { window.timingProbe.armed = true; window.timingProbe.t0 = 0; });
  await action();
  const handle = await page.waitForFunction(([quiet, text]) => {
    const state = window.timingProbe;
    if (state.t0 === 0 || state.pending > 0) return false;
    if (text) {
      if (!document.querySelector('[data-sequence-search-section]')?.textContent?.includes(text as string)) return false;
      // The status is in the DOM now; the step ends two frames later, when it has been painted.
      if (state.doneSeen === 0) {
        state.doneSeen = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => { state.painted = performance.now(); }));
      }
      return state.painted >= state.doneSeen ? state.painted - state.t0 : false;
    }
    return state.painted >= state.lastActivity && performance.now() - state.lastActivity > (quiet as number) ? state.painted - state.t0 : false;
  }, [QUIET_MS, doneText] as const, { timeout, polling: 'raf' });
  return Math.round((await handle.jsonValue()) as number);
}

/**
 * Time from each ArrowRight key press to the second animation frame after it, from the left edge.
 * A press that does not move the viewport is not a pan, so it fails the run instead of being timed.
 */
async function panLatency(page: Page, presses = 30): Promise<number[]> {
  await page.evaluate(selector => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.querySelector<HTMLElement>(selector)!.scrollLeft = 0;
  }, horizontalSelector);
  const samples: number[] = [];
  for (let i = 0; i < presses; i++) {
    // The listener is in place before the key is sent; otherwise the press can arrive first and go unseen.
    await page.evaluate(selector => {
      window.timingProbe.panStep = new Promise(resolve => {
        const scroller = document.querySelector<HTMLElement>(selector)!;
        document.addEventListener('keydown', () => {
          const pressed = performance.now();
          const before = scroller.scrollLeft;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ms: performance.now() - pressed, moved: scroller.scrollLeft - before })));
        }, { capture: true, once: true });
      });
    }, horizontalSelector);
    await page.keyboard.press('ArrowRight');
    const sample = await page.evaluate(() => window.timingProbe.panStep!);
    expect(sample.moved, `pan step ${i + 1} moved the viewport`).toBeGreaterThan(0);
    samples.push(Math.round(sample.ms));
  }
  return samples;
}

test.describe('session timings', () => {
  test.skip(!process.env.SESSION_TIMINGS, 'Set SESSION_TIMINGS=1 to collect session timings.');
  test.describe.configure({ timeout: 1_800_000 });

  for (const { name, build } of datasets) {
    test(name, async ({ context, browser, browserName }, testInfo) => {
      const dataset = build();
      const runs: Record<string, number | number[] | string | null>[] = [];
      for (let run = 0; run < RUNS; run++) {
        // A new page in the fixture's context: a fresh app for each run, still behind the network guard.
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await probe(page);
        await page.goto('/');
        await page.getByRole('button', { name: /Annotation Hub$/ }).click();
        const result: Record<string, number | number[] | string | null> = {};

        result.loadMs = await timed(page, () => page.getByLabel('Import sequences files', { exact: true }).setInputFiles(dataset.sequences));
        if (dataset.annotations) {
          result.annotationsMs = await timed(page, () => page.getByLabel('Import annotations files', { exact: true }).setInputFiles(dataset.annotations!));
        }
        result.alignMs = dataset.alignment
          ? await timed(page, () => page.getByLabel('Import pre-aligned FASTA file', { exact: true }).setInputFiles(dataset.alignment!))
          : null;
        result.openViewerMs = await timed(page, () => page.getByRole('button', { name: /Visual Viewport$/ }).click());

        const box = page.getByPlaceholder(/Enter (IUPAC|query) sequence\.\.\./);
        const search = page.getByRole('button', { name: 'Search', exact: true });
        const hits = page.getByRole('button', { name: /^Annotate match / });
        const clear = async () => { await page.getByRole('button', { name: 'Clear search', exact: true }).click(); await expect(hits).toHaveCount(0); };

        await page.getByRole('button', { name: 'IUPAC', exact: true }).click();
        await box.fill(dataset.query.slice(0, 20));
        result.exactMs = await timed(page, () => search.click());
        result.exactHits = await hits.count();
        await clear();

        await page.getByRole('button', { name: 'Fuzzy', exact: true }).click();
        await page.getByRole('button', { name: 'Whole query', exact: true }).click();
        await box.fill(dataset.query);
        result.wholeMs = await timed(page, () => search.click());
        result.wholeHits = await hits.count();
        await clear();

        // The Local button stays disabled until the WebAssembly module has loaded.
        const local = page.getByRole('button', { name: 'Local', exact: true });
        await expect(local).toBeEnabled({ timeout: 60_000 });
        await local.click();
        await box.fill(dataset.query);
        result.localMs = await timed(page, () => search.click(), 1_200_000, 'Search done');
        result.localHits = await page.locator('[data-search-hit]').count();
        const monitor = page.getByRole('dialog', { name: 'Local search job monitor' });
        if (await monitor.isVisible()) await monitor.getByRole('button', { name: 'Close', exact: true }).click();
        await page.getByRole('button', { name: 'Clear search', exact: true }).click();

        const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
        for (let i = 0; i < 60 && await zoomIn.isEnabled(); i++) await zoomIn.click();
        result.panMaxZoomMs = await panLatency(page);
        result.errors = errors.join(' | ');
        runs.push(result);
        await page.close();
      }
      const report = { dataset: name, rows: dataset.rows, columns: dataset.columns, features: dataset.features, queryLength: dataset.query.length,
        runs, browserName, browserVersion: browser.version(), platform: `${os.type()} ${os.release()}`, cpu: os.cpus()[0].model, cores: os.cpus().length,
        memoryGb: Math.round(os.totalmem() / 2 ** 30), node: process.version, quietMs: QUIET_MS };
      mkdirSync(OUT, { recursive: true });
      writeFileSync(path.join(OUT, `${name.replace(/[^a-z0-9]+/gi, '-')}.json`), JSON.stringify(report, null, 2));
      await testInfo.attach('session-timings', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    });
  }
});
