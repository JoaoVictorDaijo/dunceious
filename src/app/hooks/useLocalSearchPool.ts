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
import LocalSearchWorker from '@/src/workers/localSearch.worker.ts?worker&inline';
import { encodeResidues, loadScoring } from '@/src/core/search/local/scoring';
import { compareLocalHits, mergeLocalOutcomes, type LocalSearchCounts } from '@/src/core/search/local/selection';
import type { LocalStreamOutcome } from '@/src/core/search/local/stream';
import type { SearchResult } from '@/src/domain/bio/types';
import type { LocalSearchRequest, LocalSearchResponse, LocalSearchRun, LocalSearchProgress, LocalSearchResult } from '@/src/workers/protocol';

type SearchRequest = Extract<LocalSearchRequest, { type: 'search' }>;
type StreamJob = SearchRequest['jobs'][number];
type Phase = SearchRequest['phase'];
interface Pending {
  dispatch: (() => void) | null;
  dispatchNext: (worker: Worker) => void;
  id: number; total: number; outcomes: Map<string, LocalStreamOutcome>;
  assigned: Map<Worker, { job: StreamJob; phase: Phase }>; fractions: Map<string, number>;
  phase: Phase; finished: Set<string>;
  acceptOutcome: (worker: Worker, outcome: LocalStreamOutcome) => void;
  reportProgress: () => void;
  top: Array<{ hit: SearchResult; recordIndex: number }>;
  boundScore2: number | null;
  skipped: LocalSearchCounts['skippedRecords']; limit: number;
  progress: (p: LocalSearchProgress) => void;
  resolve: (result: LocalSearchResult) => void; reject: (error: Error) => void;
}
const streamKey = (index: number, strand: number) => `${index}:${strand}`;
type PoolFailure = (message: string) => void;
interface PoolState {
  members: { current: Worker[] };
  initialized: { current: Set<Worker> };
  pending: { current: Pending | null };
}

function raiseBound(p: Pending, boundScore2: number, members: Worker[], fail: PoolFailure): boolean {
  if (p.boundScore2 !== null && boundScore2 <= p.boundScore2) return true;
  p.boundScore2 = boundScore2;
  try {
    for (const member of members) {
      member.postMessage({ type: 'bound', requestId: p.id, boundScore2 } satisfies LocalSearchRequest);
    }
    return true;
  } catch (e) { fail(`Local worker dispatch failed: ${String(e)}`); return false; }
}

function createWorkerResponseHandler(worker: Worker, size: number, isAlive: () => boolean,
  { members, initialized, pending }: PoolState, setReady: (ready: boolean) => void, fail: PoolFailure) {
  return (event: MessageEvent<LocalSearchResponse>) => {
    if (!isAlive() || !members.current.includes(worker)) return;
    const m = event.data;
    if (m.type === 'init-error') { fail(`Local worker initialization failed: ${m.error}`); return; }
    if (m.type === 'ready') {
      initialized.current.add(worker);
      if (initialized.current.size === size) {
        setReady(true);
        const dispatch = pending.current?.dispatch;
        if (dispatch) { pending.current!.dispatch = null; dispatch(); }
      }
      return;
    }
    const p = pending.current;
    if (!p || m.requestId !== p.id) return;
    if (m.type === 'error') { fail(`Local search failed: ${m.error}`); return; }
    const key = m.type === 'stream-done' ? streamKey(m.outcome.recordIndex, m.outcome.strand)
      : streamKey(m.recordIndex, m.strand);
    const assigned = p.assigned.get(worker);
    if (!assigned || streamKey(assigned.job.recordIndex, assigned.job.strand) !== key) {
      fail('Local worker returned an unassigned stream'); return;
    }
    if (m.type === 'hit') {
      if (m.hit.recordId !== assigned.job.record.id || m.hit.strand !== assigned.job.strand) {
        fail('Local worker returned a hit for an unassigned record or strand'); return;
      }
      if (assigned.phase !== 'align') { fail('Local worker returned an alignment during scoring'); return; }
      p.top.push({ hit: m.hit, recordIndex: m.recordIndex });
      p.top.sort(compareLocalHits);
      p.top.length = Math.min(p.top.length, p.limit);
      if (p.top.length === p.limit) {
        const boundScore2 = p.top[p.limit - 1].hit.local!.score * 2;
        raiseBound(p, boundScore2, members.current, fail);
      }
      return;
    }
    if (m.type === 'progress') {
      p.fractions.set(key, m.fraction); p.reportProgress();
    } else {
      if (m.phase !== assigned.phase) { fail('Local worker returned an unassigned phase'); return; }
      p.acceptOutcome(worker, m.outcome);
    }
  };
}

function startPendingRun(request: LocalSearchRun, onProgress: Pending['progress'],
  jobs: SearchRequest['jobs'], skipped: LocalSearchCounts['skippedRecords'],
  { members, initialized, pending }: PoolState, nextId: { current: number },
  fail: PoolFailure): Promise<LocalSearchResult> {
  return new Promise((resolve, reject) => {
    let queue = jobs;
    let nextJob = 0;
    let scoresDone = 0;
    const p: Pending = { dispatch: null, dispatchNext: () => {}, acceptOutcome: () => {}, reportProgress: () => {},
      id: ++nextId.current, total: jobs.length, phase: 'score', finished: new Set(),
      outcomes: new Map(), assigned: new Map(), fractions: new Map(), top: [], boundScore2: null,
      skipped, limit: request.limit, progress: onProgress, resolve, reject };
    pending.current = p;
    p.reportProgress = () => {
      if (pending.current !== p) return;
      p.progress({ phase: p.phase, streamsDone: p.phase === 'score' ? scoresDone : p.finished.size, streamsTotal: p.total,
        currentFraction: p.fractions.size ? [...p.fractions.values()].reduce((a, b) => a + b, 0) / p.fractions.size : 0 });
    };
    const finishIfDone = () => {
      if (pending.current !== p || p.finished.size !== p.total) return;
      p.reportProgress();
      if (pending.current !== p) return;
      pending.current = null;
      p.resolve(mergeLocalOutcomes([...p.outcomes.values()], p.limit, p.skipped));
    };
    p.dispatchNext = worker => {
      if (pending.current !== p) return;
      while (nextJob < queue.length) {
        if (pending.current !== p) return;
        const job = queue[nextJob++];
        const key = streamKey(job.recordIndex, job.strand);
        // Equality can still change which hits survive the canonical tie ordering.
        if (p.phase === 'align' && p.boundScore2 !== null
          && p.outcomes.get(key)!.firstScore2! < p.boundScore2) {
          p.finished.add(key); p.reportProgress();
          continue;
        }
        p.assigned.set(worker, { job, phase: p.phase });
        try {
          worker.postMessage({ type: 'search', phase: p.phase, requestId: p.id, query: request.query,
            scoring: request.scoring, moleculeType: request.moleculeType, limit: request.limit,
            filters: request.filters, jobs: [{ ...job, ...(p.phase === 'align'
              ? { upperBoundScore2: p.outcomes.get(key)!.firstScore2! } : {}) }], boundScore2: p.boundScore2 } satisfies SearchRequest);
        } catch (e) { fail(`Local worker dispatch failed: ${String(e)}`); }
        return;
      }
      finishIfDone();
    };
    p.acceptOutcome = (worker, outcome) => {
      const key = streamKey(outcome.recordIndex, outcome.strand);
      p.outcomes.set(key, outcome); p.fractions.delete(key); p.assigned.delete(worker);
      if (p.phase === 'score') {
        scoresDone++;
        if (outcome.exhausted) p.finished.add(key);
        if (scoresDone === p.total) {
          p.phase = 'align'; nextJob = 0;
          queue = jobs.map((job, order) => ({ job, order,
            outcome: p.outcomes.get(streamKey(job.recordIndex, job.strand))! }))
            .filter(entry => !entry.outcome.exhausted)
            .sort((a, b) => b.outcome.firstScore2! - a.outcome.firstScore2! || a.order - b.order)
            .map(entry => entry.job);
          // Each unfiltered positive stream guarantees a passing first hit, so the N-th ub
          // bounds the final cutoff from below. Display filters can reject those first hits,
          // making this seed unsound when either filter is set.
          if (request.filters.minIdentity === null && request.filters.minQueryCoverage === null && queue.length >= p.limit) {
            const seedScore2 = p.outcomes.get(streamKey(queue[p.limit - 1].recordIndex, queue[p.limit - 1].strand))!.firstScore2!;
            if (!raiseBound(p, seedScore2, members.current, fail)) return;
          }
          for (const member of members.current) p.dispatchNext(member);
        } else p.dispatchNext(worker);
      } else {
        p.finished.add(key); p.dispatchNext(worker);
      }
      p.reportProgress(); finishIfDone();
    };
    onProgress({ phase: 'score', streamsDone: 0, streamsTotal: jobs.length, currentFraction: 0 });
    const dispatch = () => { members.current.forEach(worker => p.dispatchNext(worker)); };
    // A restart can queue the next search before React publishes replacement readiness.
    if (initialized.current.size === members.current.length) dispatch();
    else p.dispatch = dispatch;
  });
}

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
  const fail = useCallback((message: string) => {
    pending.current?.reject(new Error(message)); pending.current = null;
    retire(); setReady(false); setError(message);
  }, [retire]);
  useEffect(() => {
    let alive = true;
    const spawn = () => {
      retire(); setReady(false); setError(null);
      if (!bytes) return;
      try {
        const size = Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 8) - 1);
        for (let i = 0; i < size; i++) {
          const worker = new LocalSearchWorker();
          members.current.push(worker);
          worker.onerror = e => fail(`Local worker error: ${e.message}`);
          worker.onmessageerror = () => fail('Local worker response could not be decoded');
          worker.onmessage = createWorkerResponseHandler(worker, size, () => alive,
            { members, initialized, pending }, setReady, fail);
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
  }, [bytes, fail, retire]);
  const cancel = useCallback(() => {
    pending.current?.reject(new DOMException('Local search cancelled', 'AbortError'));
    pending.current = null; restart.current();
  }, []);
  const run = useCallback((request: LocalSearchRun, onProgress: Pending['progress']): Promise<LocalSearchResult> => {
    if (pending.current) return Promise.reject(new Error('Local search already running'));
    if (!members.current.length) return Promise.reject(new Error(error ?? 'Local search is not ready'));
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
    return startPendingRun(request, onProgress, jobs, skipped,
      { members, initialized, pending }, nextId, fail);
  }, [error, fail]);
  return { ready, error, run, cancel };
}
