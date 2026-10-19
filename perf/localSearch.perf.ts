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

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, expect as browserExpect, type Browser } from '@playwright/test';
import { mergeLocalOutcomes } from '../src/core/search/local/selection';
import type { LocalSearchResponse } from '../src/workers/protocol';

type StreamDone = Extract<LocalSearchResponse, { type: 'stream-done' }>;
type ProbeWindow = Window & typeof globalThis & {
  reportLocalProgress(value: { worker: number; phase: string; completed: number; recordIndex: number; strand: number; alignments: number; peakMemoryBytes: number }): Promise<void>;
  localProbe: { workers: number; error: string | null; messages: Array<{ worker: number; at: number; message: StreamDone }> };
};
let browser: Browser;
let server: ReturnType<typeof spawn>;
const measurements: unknown[] = [];
function saveMeasurements() {
  writeFileSync('/tmp/ls-phase4-performance.json', JSON.stringify({ cpus: availableParallelism(), meminfo: readFileSync('/proc/meminfo', 'utf8').split('\n').slice(0, 3), measurements }, null, 2));
}
beforeAll(async () => {
  server = spawn('rtk', ['proxy', 'npm', 'run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { detached: true, stdio: 'ignore' });
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw new Error(`Performance preview exited: ${server.exitCode}`);
    const listening = await fetch('http://127.0.0.1:4173').then(response => response.ok, () => false);
    if (listening) break;
    if (attempt >= 100) throw new Error('Performance preview did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
}, 20000);
afterAll(async () => {
  try { await browser?.close(); }
  finally {
    if (server?.pid && server.exitCode === null) process.kill(-server.pid, 'SIGTERM');
    saveMeasurements();
  }
});
function dna(length: number, seed: number) {
  let state = seed;
  return Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 'ACGT'[state >>> 30];
  }).join('');
}
function checkPhases(messages: ProbeWindow['localProbe']['messages']) {
  const scoring = messages.filter(m => m.message.phase === 'score');
  const alignment = messages.filter(m => m.message.phase === 'align');
  expect(scoring).toHaveLength(100);
  expect(scoring.every(m => m.message.outcome.alignmentsEnumerated === 0 && m.message.outcome.hits.length === 0)).toBe(true);
  expect(new Set(alignment.map(m => `${m.message.outcome.recordIndex}:${m.message.outcome.strand}`)).size).toBe(alignment.length);
  expect(new Set(scoring.map(m => `${m.message.outcome.recordIndex}:${m.message.outcome.strand}`)).size).toBe(100);
  return { scoring, alignment };
}
const records = Array.from({ length: 50 }, (_, i) => ({ id: `synthetic-${i}`, sequence: dna(30000, i + 1) }));
const fasta = records.map(r => `>${r.id}\n${r.sequence}\n`).join('');
for (const queryLength of [300, 1000]) it(`measures ${queryLength} nt against 50 × 30 kb on both strands through the app`, async () => {
  let baseline: ReturnType<typeof mergeLocalOutcomes> | null = null;
  for (const pool of ['single', 'default'] as const) {
    const context = await browser.newContext();
    try {
      await context.addInitScript(single => {
        if (single) Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
        const probe = { workers: 0, error: null, messages: [] } as ProbeWindow['localProbe'];
        (window as ProbeWindow).localProbe = probe;
        window.addEventListener('error', event => { probe.error = event.message; });
        window.addEventListener('unhandledrejection', event => { probe.error = String(event.reason); });
        const OriginalWorker = window.Worker;
        // Observe the real app pool without substituting dispatch, computation or results.
        window.Worker = class extends OriginalWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            let worker: number | undefined;
            this.addEventListener('message', (event: MessageEvent<LocalSearchResponse>) => {
              if (event.data.type === 'stream-done') {
                worker ??= probe.workers++;
                probe.messages.push({ worker, at: performance.now(), message: event.data });
                void (window as ProbeWindow).reportLocalProgress({ worker, phase: event.data.phase, completed: probe.messages.length,
                  recordIndex: event.data.outcome.recordIndex, strand: event.data.outcome.strand,
                  alignments: event.data.outcome.alignmentsEnumerated, peakMemoryBytes: event.data.peakMemoryBytes });
              }
            });
          }
        };
      }, pool === 'single');
      const page = await context.newPage();
      await page.exposeFunction('reportLocalProgress', value => console.log(JSON.stringify({ progress: true, queryLength, pool, ...value })));
      await page.goto('http://127.0.0.1:4173/');
      await page.getByRole('button', { name: /Annotation Hub$/ }).click();
      await page.getByLabel('Import sequences files', { exact: true }).setInputFiles({ name: 'synthetic.fasta', mimeType: 'text/plain', buffer: Buffer.from(fasta) });
      await browserExpect(page.getByRole('button', { name: 'Jump to sequence synthetic-0', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Visual Viewport$/ }).click();
      await page.getByRole('button', { name: 'Fuzzy', exact: true }).click();
      await browserExpect(page.getByText('Local search ready', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Local', exact: true }).click();
      await browserExpect(page.locator('[data-sequence-search-section] select')).toHaveValue('both');
      await page.getByPlaceholder('Enter query sequence...').fill(records[0].sequence.slice(10000, 10000 + queryLength));
      const start = await page.evaluate(() => performance.now());
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      const terminal = await page.waitForFunction(() => {
        if ((window as ProbeWindow).localProbe.error) return { error: (window as ProbeWindow).localProbe.error };
        const section = document.querySelector('[data-sequence-search-section]');
        const failure = section?.querySelector('[role="alert"]');
        if (failure) return { error: failure.textContent };
        if ([...(section?.querySelectorAll('[role="status"]') ?? [])].some(node => node.textContent === 'Search done')) return { done: true };
        return false;
      }, undefined, { timeout: 1200000 });
      const status = await terminal.jsonValue() as { error?: string; done?: boolean };
      if (status.error) throw new Error(status.error);
      await browserExpect(page.locator('[data-sequence-search-section]').getByText('Search done', { exact: true }).last()).toBeVisible();
      const measured = await page.evaluate(start => ({ wallMs: performance.now() - start, ...((window as ProbeWindow).localProbe), hardwareConcurrency: navigator.hardwareConcurrency }), start);
      await browserExpect(page.locator('[data-search-hit]').first()).toContainText(`Score ${queryLength * 5}`);
      expect(measured.workers).toBe(pool === 'single' ? 1 : Math.max(1, Math.min(measured.hardwareConcurrency || 2, 8) - 1));
      const { scoring, alignment } = checkPhases(measured.messages);
      const peakMemory = Array.from({ length: measured.workers }, (_, worker) => Math.max(0, ...measured.messages.filter(m => m.worker === worker).map(m => m.message.peakMemoryBytes)));
      expect(peakMemory.every(n => Number.isInteger(n) && n > 0)).toBe(true);
      const outcomes = new Map(measured.messages.map(m => [`${m.message.outcome.recordIndex}:${m.message.outcome.strand}`, m.message.outcome]));
      const merged = mergeLocalOutcomes([...outcomes.values()], 100, []);
      expect(merged.counts.streams).toBe(100);
      if (baseline) expect(merged).toEqual(baseline); else baseline = merged;
      const scoringMs = Math.max(...scoring.map(m => m.at)) - start;
      const enumerations = measured.messages.map(m => ({ phase: m.message.phase, recordIndex: m.message.outcome.recordIndex, strand: m.message.outcome.strand, alignments: m.message.outcome.alignmentsEnumerated })).sort((a, b) => a.recordIndex - b.recordIndex || b.strand - a.strand || a.phase.localeCompare(b.phase));
      const result = { queryLength, pool, poolSize: measured.workers, wallMs: measured.wallMs,
        scoringMs, alignmentMs: measured.wallMs - scoringMs,
        skippedStreams: scoring.filter(m => !m.message.outcome.exhausted).length - alignment.length,
        alignmentsEnumerated: enumerations.reduce((sum, stream) => sum + stream.alignments, 0),
        peakMemoryBytesPerWorker: peakMemory, enumerations, counts: merged.counts };
      measurements.push(result);
      saveMeasurements();
      console.log(JSON.stringify(result));
    } finally { await context.close(); }
  }
}, 2400000);
