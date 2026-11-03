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

import type { SearchResult } from '@/src/domain/bio/types';
import type { SearchPanelProps, GroupedSearchResults } from '../SearchPanel';
import { HitAlignmentSummary } from './HitAlignment';

type GroupProps = Pick<SearchPanelProps, 'records' | 'completedSearch' | 'getSequenceContext'
  | 'currentSearchIdx' | 'onSetCurrentIdx' | 'onSetActiveTab' | 'onSetActiveSelection'
  | 'selectedSearchIndices' | 'onSetSelectedIndices' | 'onAnnotateMatch'
  | 'onToggleRecordSelection' | 'onJoinAllInRecord'> & {
  recordId: string; group: GroupedSearchResults[string];
};
type CardProps = Omit<GroupProps, 'group' | 'onToggleRecordSelection' | 'onJoinAllInRecord'> & {
  match: SearchResult; globalIdx: number;
};

function ResultActions({ match, isActive, onAnnotateMatch, completedSearch }: Pick<CardProps,
  'match' | 'onAnnotateMatch' | 'completedSearch'> & { isActive: boolean }) {
  return (
    <div className="mt-3 flex justify-between items-center">
      <div className="flex gap-2">
        {isActive && (
          <span className="text-[11px] font-semibold text-env flex items-center gap-1 animate-pulse">
            <i className="fas fa-eye"></i> Active
          </span>
        )}
      </div>
      <button
        onClick={e => {
          e.stopPropagation();
          onAnnotateMatch(match.recordId, match.start, match.end, `Match: ${match.sequence}`, match.segments, match.strand, completedSearch ? { result: match, search: completedSearch } : undefined);
        }}
        aria-label={`Annotate match ${match.start}–${match.end} in ${match.recordId}`}
        data-tip="Save this match as an annotation"
        className="shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-env transition-all text-[11px] font-semibold text-env flex items-center gap-2 bg-env/10 hover:bg-env/20 px-3 py-1.5 rounded-lg border border-env/20"
      >
        <i className="fas fa-plus text-[10px]"></i> Annotate
      </button>
    </div>
  );
}

function SearchResultCard(props: CardProps) {
  const { match, globalIdx, recordId, records, completedSearch, getSequenceContext,
    currentSearchIdx, onSetCurrentIdx, onSetActiveTab, onSetActiveSelection,
    selectedSearchIndices, onSetSelectedIndices } = props;
  const context = getSequenceContext(match.recordId, match.start, match.end);
  const isActive = currentSearchIdx === globalIdx;
  const record = records.find(r => r.id === recordId);

  return (
    <div
      data-search-hit=""
      onClick={() => {
        onSetCurrentIdx(globalIdx);
        onSetActiveTab('alignment');
        onSetActiveSelection({ start: match.start, end: match.end, recordIds: [match.recordId] });
      }}
      className={`group relative bg-slate-950/60 rounded-2xl p-4 border transition-all cursor-pointer ${isActive ? 'border-env ring-2 ring-env/20 bg-env/5' : 'border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/40'}`}
    >
      <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
        <div className={`flex items-center ${match.local ? 'gap-1' : 'gap-3'}`}>
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={selectedSearchIndices.has(globalIdx)}
              onChange={e => {
                e.stopPropagation();
                const next = new Set(selectedSearchIndices);
                if (e.target.checked) next.add(globalIdx);
                else next.delete(globalIdx);
                onSetSelectedIndices(next);
              }}
              className="w-4 h-4 rounded-lg border-slate-700 bg-slate-900 text-env focus:ring-env cursor-pointer"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-slate-200 tracking-tight">
              <span className="whitespace-nowrap">{(match.start + 1).toLocaleString()} <span className="text-slate-500 font-normal">→</span></span> <span className="whitespace-nowrap">{match.end.toLocaleString()}</span>
            </span>
            <span className="text-[11px] font-semibold text-slate-500">Position</span>
          </div>
        </div>
        <div className={`ml-auto flex flex-wrap items-center justify-end gap-y-1.5 ${match.local ? 'gap-x-1' : 'gap-x-2'}`}>
          {match.local ? <div className="flex flex-col items-end whitespace-nowrap">
            <span className="text-[10px] font-bold text-amber-500" data-tip="Local alignment score in EMBOSS units, using the scoring scheme in Local options">Score {match.local.score}</span>
            <span className="text-[11px] font-semibold text-slate-400" data-tip="Identity = 100 × identical columns / alignment length, including gap columns">{(100 * match.local.identical / match.local.length).toFixed(1)}%</span>
          </div> : match.identity !== undefined && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-amber-500">
                {Math.floor(match.identity)}%
              </span>
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">{match.edits === 1 ? '1 edit' : `${match.edits ?? 0} edits`}</span>
            </div>
          )}
          <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${match.strand === 1 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
            {match.strand === 1 ? 'Forward' : 'Reverse'}
          </div>
        </div>
      </div>

      {record && completedSearch ? <HitAlignmentSummary result={match} record={record} search={completedSearch} /> : <div className="seq-scroll text-[11px] font-mono overflow-x-auto whitespace-nowrap">
        {context.pre}<strong>{context.match}</strong>{context.post}
      </div>}

      <ResultActions match={match} isActive={isActive}
        onAnnotateMatch={props.onAnnotateMatch} completedSearch={completedSearch} />
    </div>
  );
}

export function SearchResultGroup({ recordId, group, onToggleRecordSelection, onJoinAllInRecord, ...props }: GroupProps) {
  return (
    <div className="stack-y-4">
      <div className="flex items-center justify-between sticky top-0 bg-slate-950 z-10 py-2 border-b border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-env"></div>
          <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[140px]">{recordId}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onToggleRecordSelection(recordId, true)}
            data-tip="Select every match in this record"
            className="text-[11px] font-semibold text-slate-400 hover:text-env transition-colors"
          >
            Select all
          </button>
          <button
            onClick={() => onJoinAllInRecord(recordId)}
            className="text-[11px] font-semibold text-slate-400 hover:text-emerald-400 transition-colors"
            data-tip="Create one multi-segment annotation from every match in this record"
          >
            Join all
          </button>
        </div>
      </div>

      <div className="stack-y-3 pl-1">
        {group.results.map((match, localIdx) => <SearchResultCard key={group.indices[localIdx]}
          {...props} recordId={recordId} match={match} globalIdx={group.indices[localIdx]} />)}
      </div>
    </div>
  );
}
