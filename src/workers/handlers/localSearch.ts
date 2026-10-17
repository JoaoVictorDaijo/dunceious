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

import { instantiateLocalEngine, type LocalEngine } from '../../core/search/local/engine';
import { encodeResidues, loadScoring } from '../../core/search/local/scoring';
import { iterateLocalStream, type LocalStreamOutcome } from '../../core/search/local/stream';
import type { SearchResult } from '../../domain/bio/types';
import type { LocalSearchRequest, LocalSearchResponse } from '../protocol';

const yieldToMessages = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function createLocalSearchHandler(post: (message: LocalSearchResponse) => void,
  instantiate = instantiateLocalEngine, yieldTask = yieldToMessages) {
  let engine: LocalEngine | null = null;
  let boundRequestId: number | null = null;
  let boundScore2: number | null = null;
  let active = false;
  return async (request: LocalSearchRequest): Promise<void> => {
    if (request.type === 'init') {
      try {
        engine = await instantiate(await WebAssembly.compile(request.wasm));
        post({ type: 'ready' });
      } catch (e) { post({ type: 'init-error', error: e instanceof Error ? e.message : String(e) }); }
      return;
    }
    if (request.type === 'bound') {
      if (request.requestId === boundRequestId) {
        boundScore2 = Math.max(boundScore2 ?? -Infinity, request.boundScore2);
      }
      return;
    }
    const { requestId } = request;
    if (active) {
      post({ type: 'error', requestId, error: 'Local worker already has an active stream' });
      return;
    }
    active = true;
    if (boundRequestId !== requestId) {
      boundRequestId = requestId;
      boundScore2 = request.boundScore2;
    } else if (request.boundScore2 !== null) {
      boundScore2 = Math.max(boundScore2 ?? -Infinity, request.boundScore2);
    }
    try {
      if (!engine) throw new Error('Local engine is not initialized');
      const scoring = loadScoring(request.scoring);
      const encoded = encodeResidues(request.query, scoring);
      if ('invalid' in encoded) throw new Error(`Unsupported query characters: ${encoded.invalid.join(', ')}`);
      for (const job of request.jobs) {
        const iterator: Iterator<SearchResult | null, LocalStreamOutcome> = iterateLocalStream(engine,
          { ...request, ...job, queryCodes: encoded.codes, scoring },
          fraction => post({ type: 'progress', requestId, recordIndex: job.recordIndex, strand: job.strand, fraction }),
          () => request.phase === 'bootstrap' ? null : boundScore2, request.phase === 'bootstrap');
        try {
          while (true) {
            const next = iterator.next();
            if (next.done) {
              post({ type: 'stream-done', phase: request.phase, requestId, outcome: next.value, peakMemoryBytes: engine.peakMemoryBytes() });
              break;
            }
            if (next.value) post({ type: 'hit', requestId, recordIndex: job.recordIndex, strand: job.strand, hit: next.value });
            // Message events need a task boundary, including after overlap/filter-hidden candidates.
            await yieldTask();
          }
        } finally { iterator.return?.(); }
      }
    } catch (e) { post({ type: 'error', requestId, error: e instanceof Error ? e.message : String(e) }); }
    finally { active = false; }
  };
}
