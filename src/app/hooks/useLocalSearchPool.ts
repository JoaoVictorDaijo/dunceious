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

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeResidues, loadScoring } from '@/src/core/search/local/scoring';
import { mergeLocalOutcomes, type LocalSearchCounts } from '@/src/core/search/local/selection';
import type { LocalStreamOutcome } from '@/src/core/search/local/stream';
import type { LocalSearchRequest, LocalSearchResponse, LocalSearchRun, LocalSearchProgress, LocalSearchResult } from '@/src/workers/protocol';

type SearchRequest = Extract<LocalSearchRequest, { type: 'search' }>;
interface Pending {
  id: number; total: number; outcomes: Map<string, LocalStreamOutcome>;
  assigned: Map<Worker, Set<string>>; fractions: Map<string, number>;
  skipped: LocalSearchCounts['skippedRecords']; limit: number;
  progress: (p: LocalSearchProgress) => void;
  resolve: (result: LocalSearchResult) => void; reject: (error: Error) => void;
}
const streamKey = (index: number, strand: number) => `${index}:${strand}`;
export function useLocalSearchPool(bytes: ArrayBuffer | null) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const members = useRef<Worker[]>([]);
  const initialized = useRef(new Set<Worker>());
  const pending = useRef<Pending | null>(null);
  const nextId = useRef(0);
  const restart = useRef<() => void>(() => {});
  const retire = useCallback(() => {
    for (const w of members.current) { w.onmessage = null; w.onerror = null; w.onmessageerror = null; w.terminate(); }
    members.current = []; initialized.current.clear();
  }, []);
  useEffect(() => {
    let alive = true;
    const fail = (message: string) => {
      pending.current?.reject(new Error(message)); pending.current = null;
      retire();
      if (alive) { setReady(false); setError(message); }
    };
    const spawn = () => {
      retire(); setReady(false); setError(null);
      if (!bytes) return;
      try {
        const size = Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 8) - 1);
        for (let i = 0; i < size; i++) {
          const worker = new Worker(new URL('@/src/workers/localSearch.worker.ts', import.meta.url), { type: 'module' });
          members.current.push(worker);
          worker.onerror = e => fail(`Local worker error: ${e.message}`);
          worker.onmessageerror = () => fail('Local worker response could not be decoded');
          worker.onmessage = (event: MessageEvent<LocalSearchResponse>) => {
            if (!alive || !members.current.includes(worker)) return;
            const m = event.data;
            if (m.type === 'init-error') { fail(`Local worker initialization failed: ${m.error}`); return; }
            if (m.type === 'ready') {
              initialized.current.add(worker);
              if (initialized.current.size === size) setReady(true);
              return;
            }
            const p = pending.current;
            if (!p || m.requestId !== p.id) return;
            if (m.type === 'error') { fail(`Local search failed: ${m.error}`); return; }
            const key = m.type === 'progress' ? streamKey(m.recordIndex, m.strand) : streamKey(m.outcome.recordIndex, m.outcome.strand);
            if (!p.assigned.get(worker)?.has(key)) { fail('Local worker returned an unassigned stream'); return; }
            if (m.type === 'progress') p.fractions.set(key, m.fraction);
            else { p.outcomes.set(key, m.outcome); p.fractions.delete(key); }
            p.progress({ streamsDone: p.outcomes.size, streamsTotal: p.total,
              currentFraction: p.fractions.size ? [...p.fractions.values()].reduce((a, b) => a + b, 0) / p.fractions.size : 0 });
            if (p.outcomes.size === p.total) {
              pending.current = null;
              p.resolve(mergeLocalOutcomes([...p.outcomes.values()], p.limit, p.skipped));
            }
          };
          try { worker.postMessage({ type: 'init', wasm: bytes } satisfies LocalSearchRequest); }
          catch (e) { fail(`Local worker initialization dispatch failed: ${String(e)}`); return; }
        }
      } catch (e) { fail(`Local worker start failed: ${String(e)}`); }
    };
    restart.current = spawn; spawn();
    return () => {
      alive = false; restart.current = () => {};
      pending.current?.reject(new DOMException('Local search cancelled', 'AbortError'));
      pending.current = null; retire();
    };
  }, [bytes, retire]);
  const cancel = useCallback(() => {
    pending.current?.reject(new DOMException('Local search cancelled', 'AbortError'));
    pending.current = null; restart.current();
  }, []);
  const run = useCallback((request: LocalSearchRun, onProgress: Pending['progress']): Promise<LocalSearchResult> => {
    if (pending.current) return Promise.reject(new Error('Local search already running'));
    if (!ready || !members.current.length) return Promise.reject(new Error(error ?? 'Local search is not ready'));
    const scoring = loadScoring(request.scoring);
    const q = encodeResidues(request.query, scoring);
    if ('invalid' in q) return Promise.reject(new Error(`Unsupported query characters: ${q.invalid.join(', ')}`));
    if (!Number.isInteger(request.limit) || request.limit < 1) return Promise.reject(new Error('Local result limit must be positive'));
    const skipped: LocalSearchCounts['skippedRecords'] = [];
    const jobs: SearchRequest['jobs'] = [];
    request.records.forEach((record, recordIndex) => {
      const encoded = encodeResidues((record.alignedSequence || record.sequence).replace(/-/g, ''), scoring);
      if ('invalid' in encoded) { skipped.push({ recordId: record.id, characters: encoded.invalid }); return; }
      if (request.moleculeType === 'protein' || request.strand !== 'rev') jobs.push({ recordIndex, record, strand: 1 });
      if (request.moleculeType !== 'protein' && request.strand !== 'fwd') jobs.push({ recordIndex, record, strand: -1 });
    });
    if (!jobs.length) return Promise.resolve(mergeLocalOutcomes([], request.limit, skipped));
    return new Promise((resolve, reject) => {
      const groups = members.current.map(() => [] as SearchRequest['jobs']);
      jobs.forEach((job, i) => groups[i % groups.length].push(job));
      const p: Pending = { id: ++nextId.current, total: jobs.length, outcomes: new Map(), assigned: new Map(), fractions: new Map(),
        skipped, limit: request.limit, progress: onProgress, resolve, reject };
      pending.current = p;
      onProgress({ streamsDone: 0, streamsTotal: jobs.length, currentFraction: 0 });
      try {
        members.current.forEach((worker, i) => {
          if (!groups[i].length) return;
          p.assigned.set(worker, new Set(groups[i].map(j => streamKey(j.recordIndex, j.strand))));
          worker.postMessage({ ...request, type: 'search', requestId: p.id, jobs: groups[i] } satisfies SearchRequest);
        });
      } catch (e) {
        pending.current = null; reject(new Error(`Local worker dispatch failed: ${String(e)}`));
        retire(); setReady(false); setError(`Local worker dispatch failed: ${String(e)}`);
      }
    });
  }, [ready, error, retire]);
  return { ready, error, run, cancel };
}
