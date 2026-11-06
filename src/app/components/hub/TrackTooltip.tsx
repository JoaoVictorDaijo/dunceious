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
import { conceptualTranslation, translationDescription, isCds, storedTranslation, translationReason } from '@/src/domain/bio/translation';
import { formatInsdcLocation } from '@/src/domain/bio/insdcLocation';
import { validCodonStart } from '@/src/domain/bio/codonStart';
import { assumedTranslation } from '@/src/domain/bio/assumedTranslation';
import { extractCodingSequence, featureTranslTable, isNcbiGeneticCode } from '@/src/domain/bio/sequence';
import { CDS_ORF_TYPES, geneticCodeWarning, isTranslatedFeature } from '@/src/app/viewer/cds';
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { featureLengthText } from '@/src/app/logic/viewModel';
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
  const strand = getFeatureStrand(feature);
  const frameWarning = record.moleculeType !== 'protein' && CDS_ORF_TYPES.includes(feature.type) && !validCodonStart(feature.metadata?.codon_start)
    ? geneticCodeWarning(feature) : null;
  const location = displayLocation(feature, record);
  const conceptual = conceptualTranslation(feature, { ...record, biologicalLength: record.sequence.length });
  const metric = conceptual.status === 'ok'
    ? conceptual.internalStops.length ? `${conceptual.residues.length} positions, ${conceptual.internalStops.length} internal stop${conceptual.internalStops.length === 1 ? '' : 's'}` : `${conceptual.residues.length} aa`
    : `can't verify: ${translationReason(conceptual, feature)}`;
  const geometry = formatInsdcLocation({ ...feature, ...feature.biological }, { length: record.sequence.length, isCircular: record.isCircular });
  const invalidGeometry = geometry.kind === 'no-insdc-form' && geometry.reason === 'invalid-geometry';
  const translated = record.moleculeType !== 'protein' && isTranslatedFeature(feature);
  const invalidCode = translated && !isNcbiGeneticCode(featureTranslTable(feature));
  const assumed = !invalidGeometry && !frameWarning && invalidCode && (strand === 1 || strand === -1) && !storedTranslation(feature) ? assumedTranslation(feature, extractCodingSequence(feature, record.sequence, { isCircular: record.isCircular, biologicalLength: record.sequence.length }).codingSeq) : undefined;
  const count = !invalidGeometry && !frameWarning && invalidCode && (strand === 1 || strand === -1)
    ? unverifiedCount(storedTranslation(feature) || assumed?.residues || '') : null;
  const invalidReason = `/transl_table=${feature.metadata?.transl_table ?? ''} is not an NCBI genetic code`;
  const countReason = frameWarning || !invalidCode ? null : count === null ? geneticCodeWarning(feature)
    : storedTranslation(feature)
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
    <dl className="grid grid-cols-[auto_1fr] gap-x-3"><dt>Location</dt><dd className="break-all font-mono">{location}</dd><dt>Length</dt><dd className="font-mono">{featureLengthText(record, feature)}{!invalidGeometry && (frameWarning
      ? ` · ${frameWarning}`
      : invalidCode
      ? count !== null && <> · <span data-unverified-count="" className="italic underline decoration-dotted underline-offset-2" aria-describedby={reasonId}>{count}</span></>
      : isCds(feature) && record.moleculeType !== 'protein' && ` · ${metric}${conceptual.status === 'ok' && conceptual.threePrimeIndeterminate ? ' · end uncertain' : ''}`)}</dd><dt>Strand</dt><dd>{strand === 1 ? 'forward (+)' : strand === -1 ? 'reverse (−)' : 'unknown'}</dd><dt>Sequence</dt><dd className="font-mono">{record.id}</dd></dl>
    <p className="mt-2 text-slate-400" title="Translation positions without the terminal stop; internal stops and X/U/O included.">Click to jump to the row</p>
    {!invalidGeometry && isCds(feature) && conceptual.status === 'ok' && <p className="mt-2 text-[10px] text-slate-400">Translation positions without the terminal stop; internal stops and X/U/O included.</p>}
    {isCds(feature) && <p className="mt-2 text-[10px] text-slate-400">{translationDescription(feature, record)}</p>}
    {countReason && <p id={reasonId} data-count-reason="" className="mt-2 text-[10px] text-slate-400">{countReason}</p>}
  </div>;
}
export function trackFeatureColor(feature: BioFeature, colors?: Record<string, string>) { return feature.color || getFeatureColor(feature.type, colors); }
