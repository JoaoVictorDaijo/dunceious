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

import type { SearchResult, SeqRecord } from '@/src/domain/bio/types';
import type { CompletedSearch } from '../../logic/searchState';
import { hitColumns, hitCounts } from '@/src/core/search/hitColumns';
import { pathQuery } from '@/src/core/search/editPath';
import { ungappedSpan } from '@/src/core/search/hitPaths';
import { formatPairAlignment, hitCountsText } from '../../logic/hitAlignmentText';
import { HitBarcode } from './HitBarcode';
import { useState, type ReactNode } from 'react';
import { useSessionOpenState } from '../../hooks/useSessionOpenState';
import SectionTitle from '../SectionTitle';
import { useUiEffects } from '../uiEffects';

export function HitAlignment({ text, shownText = text, storageKey, metrics }: { text: string; shownText?: string; storageKey: string; metrics?: ReactNode }) {
  const { copyText } = useUiEffects();
  const [open, setOpen] = useSessionOpenState(`alignment:${storageKey}`);
  const [copyStatus, setCopyStatus] = useState('');
  return <details data-hit-alignment="" open={open} onToggle={e => setOpen(e.currentTarget.open)}
    onClick={e => e.stopPropagation()} className="group mt-3 text-slate-400">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <SectionTitle icon="fa-align-left" trailing={<i aria-hidden="true" className="fas fa-chevron-up text-[10px] transition-transform group-open:rotate-180 motion-reduce:transition-none" />}>Alignment</SectionTitle>
    </summary>
    {open && metrics}
    <button type="button" className="text-xs text-env px-2 py-1" onClick={async () => {
      try { setCopyStatus(await copyText(text) ? 'Copied' : ''); }
      catch { setCopyStatus('Copy failed'); }
    }}>Copy</button><span role="status" className="text-xs">{copyStatus}</span>
    <pre className="custom-scrollbar-pro overflow-x-auto text-[10px] font-mono p-2 bg-slate-950 rounded">{shownText}</pre>
  </details>;
}

function ResultMetrics({ match }: { match: SearchResult }) {
  return <>
    {match.local && <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400 mb-2">
      <span>Identity {match.local.identical}/{match.local.length} ({(100 * match.local.identical / match.local.length).toFixed(1)}%)</span>
      <span>Similarity {match.local.similar}/{match.local.length} ({(100 * match.local.similar / match.local.length).toFixed(1)}%)</span>
      <span>Gaps {match.local.gaps}/{match.local.length} ({(100 * match.local.gaps / match.local.length).toFixed(1)}%)</span>
      <span>Query coverage {match.local.queryEnd - match.local.queryStart}/{match.local.queryLength} ({(100 * (match.local.queryEnd - match.local.queryStart) / match.local.queryLength).toFixed(1)}%)</span>
      <span>Query {match.local.queryStart + 1}–{match.local.queryEnd} of {match.local.queryLength}</span>
      <span>Length {match.local.length}</span>
    </div>}
  </>;
}

// 28 label/coordinate characters plus this many columns fit the default 1080p (400 px) sidebar at 10px mono.
const SIDEBAR_ALIGNMENT_COLUMNS = 20;

export function HitAlignmentSummary({ result, record, search }: { result: SearchResult; record: SeqRecord; search: CompletedSearch }) {
  const columns = hitColumns({ ...search, cigar: result.cigar, query: pathQuery(search.query, search.mode), span: ungappedSpan(result, record) });
  const seq = record.alignedSequence || record.sequence;
  const recordStart = result.strand === 1 ? seq.slice(0, result.start).replace(/-/g, '').length + 1
    : seq.slice(0, result.end).replace(/-/g, '').length;
  const pair = { columns, queryName: 'Query', recordName: result.recordId, queryStart: (result.local?.queryStart ?? 0) + 1, recordStart, strand: result.strand };
  return <>
    <HitBarcode columns={columns} strand={result.strand} alphabet={search.alphabet} mode={search.mode} />
    <p className="text-[11px] text-slate-400 mt-1">{hitCountsText(hitCounts(columns), search.mode)}</p>
    <HitAlignment metrics={result.local ? <ResultMetrics match={result} /> : undefined} storageKey={`${result.recordId}:${result.start}:${result.end}:${result.strand}`}
      text={formatPairAlignment(pair)} shownText={formatPairAlignment({ ...pair, width: SIDEBAR_ALIGNMENT_COLUMNS })} />
  </>;
}
