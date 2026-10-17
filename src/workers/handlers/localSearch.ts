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
import { runLocalStream } from '../../core/search/local/stream';
import type { LocalSearchRequest, LocalSearchResponse } from '../protocol';

export function createLocalSearchHandler(post: (message: LocalSearchResponse) => void,
  instantiate = instantiateLocalEngine) {
  let engine: LocalEngine | null = null;
  return async (request: LocalSearchRequest): Promise<void> => {
    if (request.type === 'init') {
      try {
        engine = await instantiate(await WebAssembly.compile(request.wasm));
        post({ type: 'ready' });
      } catch (e) { post({ type: 'init-error', error: e instanceof Error ? e.message : String(e) }); }
      return;
    }
    const { requestId } = request;
    try {
      if (!engine) throw new Error('Local engine is not initialized');
      const scoring = loadScoring(request.scoring);
      const encoded = encodeResidues(request.query, scoring);
      if ('invalid' in encoded) throw new Error(`Unsupported query characters: ${encoded.invalid.join(', ')}`);
      for (const job of request.jobs) {
        const outcome = runLocalStream(engine, { ...request, ...job, queryCodes: encoded.codes, scoring },
          fraction => post({ type: 'progress', requestId, recordIndex: job.recordIndex, strand: job.strand, fraction }));
        post({ type: 'stream-done', requestId, outcome, peakMemoryBytes: engine.peakMemoryBytes() });
      }
    } catch (e) { post({ type: 'error', requestId, error: e instanceof Error ? e.message : String(e) }); }
  };
}
