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

import { displayLocation } from '@/src/app/logic/displayLocation';
import { validCodonStart } from '@/src/domain/bio/codonStart';
import { assumedTranslation } from '@/src/domain/bio/assumedTranslation';
import { extractCodingSequence, featureTranslTable, isNcbiGeneticCode } from '@/src/domain/bio/sequence';
import { CDS_ORF_TYPES, geneticCodeWarning, isTranslatedFeature } from '@/src/app/viewer/cds';
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { featureLength, featureLengthText } from '@/src/app/logic/viewModel';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { getFeatureColor } from '@/src/app/viewer/colors';
export type TrackHover = { record: SeqRecord; feature: BioFeature; color: string; x: number; y: number };
const TrackTooltipContext = createContext<(hover: TrackHover | null, owner: object) => void>(() => {});
export const useTrackTooltip = () => useContext(TrackTooltipContext);
export function TrackTooltipProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<TrackHover | null>(null);
  const current = useRef<TrackHover | null>(null);
  const owner = useRef<object | null>(null);
  const update = useCallback((next: TrackHover | null, source: object) => {
    if (!next && owner.current !== source) return;
    owner.current = next ? source : null;
    if (current.current?.feature === next?.feature && current.current?.record === next?.record) return;
    current.current = next; setHover(next);
  }, []);
  return <TrackTooltipContext.Provider value={update}>{children}{hover && createPortal(<TrackTooltip hover={hover} />, document.body)}</TrackTooltipContext.Provider>;
}
function unverifiedCount(protein: string): string {
  const residues = protein.endsWith('*') ? protein.slice(0, -1) : protein;
  const stops = [...residues].filter(r => r === '*').length;
  return stops
    ? `${residues.length.toLocaleString('en-US')} positions, ${stops.toLocaleString('en-US')} stop${stops === 1 ? '' : 's'}`
    : `${residues.length.toLocaleString('en-US')} aa`;
}

function TrackTooltip({ hover }: { hover: TrackHover }) {
  const { feature, record, color } = hover;
  const length = featureLength(record.sequence.length, feature.start, feature.end, feature.segments);
  const strand = getFeatureStrand(feature);
  const frameWarning = record.moleculeType !== 'protein' && CDS_ORF_TYPES.includes(feature.type) && !validCodonStart(feature.metadata?.codon_start)
    ? geneticCodeWarning(feature) : null;
  const aminoAcids = feature.metadata?.translation?.replace(/\s/g, '').length ?? Math.floor(Math.max(0, length - (Number(feature.metadata?.codon_start || 1) - 1)) / 3);
  const location = displayLocation(feature, record);
  // An order() CDS or one with remote parts defines no single sequence, so no protein count (LOC-7).
  const translated = record.moleculeType !== 'protein' && isTranslatedFeature(feature);
  const invalidCode = translated && !isNcbiGeneticCode(featureTranslTable(feature));
  const assumed = !frameWarning && invalidCode && (strand === 1 || strand === -1) && !feature.translation ? assumedTranslation(feature, extractCodingSequence(feature, record.sequence).codingSeq) : undefined;
  const count = !frameWarning && invalidCode && (strand === 1 || strand === -1)
    ? unverifiedCount(feature.translation || assumed?.residues || '') : null;
  const invalidReason = `/transl_table=${feature.metadata?.transl_table ?? ''} is not an NCBI genetic code`;
  const countReason = frameWarning || !invalidCode ? null : count === null ? geneticCodeWarning(feature)
    : feature.translation
      ? `Count not verified: ${invalidReason}; the count is the annotation's /translation and can't be checked against the DNA.`
      : `Count not verified: ${invalidReason}; table 1 assumed.`;
  const reasonId = useId();
  const tip = useRef<HTMLDivElement>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    tip.current = element;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - bounds.width - 8, hover.x + 14))}px`;
    element.style.top = `${Math.max(8, Math.min(window.innerHeight - bounds.height - 8, hover.y + 16))}px`;
  }, [hover]);
  return <div ref={ref} role="tooltip" className="pointer-events-none fixed z-[100] max-w-xs rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-200 shadow-xl">
    <div className="mb-1 flex items-center gap-2"><span className="rounded-sm px-1.5 font-mono text-[11px]" style={{ background: color }}>{feature.type}</span><strong data-tooltip-feature>{feature.name}</strong></div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3"><dt>Location</dt><dd className="break-all font-mono">{location}</dd><dt>Length</dt><dd className="font-mono">{featureLengthText(record, feature)}{frameWarning
      ? ` · ${frameWarning}`
      : invalidCode
      ? count !== null && <> · <span data-unverified-count="" className="italic underline decoration-dotted underline-offset-2" aria-describedby={reasonId}>{count}</span></>
      : feature.type === 'CDS' && translated && ` · ${aminoAcids.toLocaleString('en-US')} aa`}</dd><dt>Strand</dt><dd>{strand === 1 ? 'forward (+)' : strand === -1 ? 'reverse (−)' : 'unknown'}</dd><dt>Sequence</dt><dd className="font-mono">{record.id}</dd></dl>
    <p className="mt-2 text-slate-400">Click to jump to the row</p>
    {countReason && <p id={reasonId} data-count-reason="" className="mt-2 text-[10px] text-slate-400">{countReason}</p>}
  </div>;
}
export function trackFeatureColor(feature: BioFeature, colors?: Record<string, string>) { return feature.color || getFeatureColor(feature.type, colors); }
