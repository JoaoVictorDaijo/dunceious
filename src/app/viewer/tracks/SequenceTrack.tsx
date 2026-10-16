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

import type { CompletedSearch } from '@/src/app/logic/searchState';
import { matchLineSymbol } from '@/src/core/search/hitColumns';
import { visibleMarks, SEARCH_QUERY_LANE_HEIGHT } from '../hitMarks';
import * as d3 from 'd3';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import type { BioFeature, SearchResult, SeqRecord } from '@/src/domain/bio/types';
import { getAminoAcidColor, getNucleotideColor } from '@/src/app/viewer/colors';
import { alignedToOriginalPositions, extractCodingSequence, translateFeature } from '@/src/domain/bio';
import { residueStyle as comparisonStyle, type ActiveComparison } from '@/src/app/logic/alignmentComparison';
import { NT_ROW_HEIGHT, AA_ROW_HEIGHT, MONO_STACK, TRANSLATION_MIN_ZOOM } from '../constants';
import { CDS_ORF_TYPES, computeBrokenFeatureMap, codonFrame, codonSpans, type TranslationLanes } from '../cds';

export interface SequenceTrackProps {
  record?: SeqRecord;
  completedSearch?: CompletedSearch | null;
  seq: string;
  moleculeType?: 'dna' | 'rna' | 'protein';
  xScale: d3.ScaleLinear<number, number>;
  viewportWidth: number;
  y: number;
  zoomLevel: number;
  scrollX: number;
  showTranslation: boolean;
  features: BioFeature[];
  translationLanes: TranslationLanes;
  conservationScores?: number[];
  showConservation?: boolean;
  searchResults: SearchResult[];
  allSearchResults: SearchResult[];
  currentSearchIdx: number;
  /** Compare this row against the reference; null (and the reference row itself) draws every residue in its own colour. */
  comparison?: ActiveComparison | null;
}

/** Residues the comparison does not highlight: present, but quiet. */
const MUTED_FILL = '#e2e8f0';
const MUTED_TEXT = '#94a3b8';
const MATCH_DOT = '#64748b';
/** A deletion against the reference: dark enough to stand out among the dots, as Nextclade marks deletions. */
const INDEL_FILL = '#475569';

const residueStyle = (char: string, column: number, comparison: ActiveComparison | null | undefined) =>
  comparisonStyle(char, comparison?.referenceSeq[column], comparison);

export const SequenceTrack: React.FC<SequenceTrackProps> = memo(({ 
  seq, record, completedSearch, moleculeType, xScale, viewportWidth, y, zoomLevel, scrollX, showTranslation, features, translationLanes,
  conservationScores, showConservation, searchResults, allSearchResults, currentSearchIdx, comparison
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const queryRef = useRef<HTMLCanvasElement>(null);
  const forwardRef = useRef<HTMLCanvasElement>(null);
  const reverseRef = useRef<HTMLCanvasElement>(null);
  const translationVisible = showTranslation && zoomLevel > TRANSLATION_MIN_ZOOM && moleculeType !== 'protein';
  const forwardHeight = AA_ROW_HEIGHT * translationLanes.forward;
  const reverseHeight = AA_ROW_HEIGHT * translationLanes.reverse;
  const bandTop = y - (translationVisible ? forwardHeight : 0);


  const activeResult = currentSearchIdx >= 0 ? allSearchResults[currentSearchIdx] : undefined;
  const activeInRow = activeResult && searchResults.includes(activeResult) ? activeResult : undefined;
  const vStart = Math.max(0, Math.floor(scrollX / zoomLevel));
  const vEnd = Math.min(seq.length, Math.ceil((scrollX + viewportWidth) / zoomLevel));
  const marks = useMemo(() => record && completedSearch
    ? visibleMarks(searchResults, activeInRow, record, completedSearch, vStart, vEnd)
    : { marks: [], insertions: [] }, [record, completedSearch, searchResults, activeInRow, vStart, vEnd]);
  const activeMarks = useMemo(() => record && completedSearch && activeInRow
    ? visibleMarks([activeInRow], activeInRow, record, completedSearch, vStart, vEnd)
    : { marks: [], insertions: [] }, [record, completedSearch, activeInRow, vStart, vEnd]);

  // Frames and frameshifts are read in biological bases, so an alignment gap
  // between two codons is neither a frame change nor a skipped base.
  const originalPositions = useMemo(() => (seq.includes('-') ? alignedToOriginalPositions(seq) : null), [seq]);

  // Pre-compute broken-protein status for each CDS/ORF feature.
  const brokenFeatureMap = useMemo(
    () => (translationVisible ? computeBrokenFeatureMap(features, seq, moleculeType) : new Map<BioFeature, boolean>()),
    [features, seq, moleculeType, translationVisible],
  );

  useEffect(() => {
    const prepareCanvas = (canvas: HTMLCanvasElement | null, height: number) => {
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return null;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewportWidth * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, viewportWidth, height);
      return ctx;
    };
    const ctx = prepareCanvas(canvasRef.current, NT_ROW_HEIGHT);
    if (!ctx) return;

    // Retain hidden band pixels for the CSS closing fade; only visible bands redraw.
    const forwardCtx = translationVisible ? prepareCanvas(forwardRef.current, forwardHeight) : null;
    const reverseCtx = translationVisible ? prepareCanvas(reverseRef.current, reverseHeight) : null;
    const seqY = 0;
    const isProtein = moleculeType === 'protein';
    const getResidueColor = isProtein ? getAminoAcidColor : getNucleotideColor;

    const vStart = Math.max(0, Math.floor(scrollX / zoomLevel) - 5);
    const vEnd = Math.min(seq.length, Math.ceil((scrollX + viewportWidth) / zoomLevel) + 5);
    const activeResult = currentSearchIdx >= 0 ? allSearchResults[currentSearchIdx] : undefined;

    // Pre-calculate search highlights for this viewport
    const highlightMap = new Map<number, { isActive: boolean, strand: number }>();
    [...searchResults].sort((a, b) => Number(a === activeResult) - Number(b === activeResult) || searchResults.indexOf(b) - searchResults.indexOf(a)).forEach(r => {
      const isActive = r === activeResult;
      
      const applyHighlight = (start: number, end: number) => {
        for (let k = start; k < end; k++) {
          if (k < vStart || k >= vEnd) continue;
          const existing = highlightMap.get(k);
          if (!existing || (!existing.isActive && isActive)) {
            highlightMap.set(k, { isActive, strand: r.strand });
          }
        }
      };

      if (r.segments && r.segments.length > 0) {
        r.segments.forEach(seg => applyHighlight(seg.start, seg.end));
      } else {
        if (r.start <= r.end) {
          applyHighlight(r.start, r.end);
        } else {
          applyHighlight(r.start, seq.length);
          applyHighlight(0, r.end);
        }
      }
    });

    // 0. Render Search Highlights (Background & Borders)
    const fullTrackH = (translationVisible ? forwardHeight + reverseHeight : 0) + NT_ROW_HEIGHT;
    const highlightLayers = [
      { ctx, highlightY: translationVisible ? -forwardHeight : 0 },
      { ctx: forwardCtx, highlightY: 0 },
      { ctx: reverseCtx, highlightY: -forwardHeight - NT_ROW_HEIGHT },
    ];
    searchResults.forEach(r => {
      const isActive = r === activeResult;
      
      const renderMatch = (start: number, end: number) => {
        const x = xScale(start) - scrollX;
        const w = xScale(end) - xScale(start);
        if (x + w < 0 || x > viewportWidth) return;

        const baseColor = r.strand === 1 ? (isActive ? "#fbbf24" : "#fef3c7") : (isActive ? "#f472b6" : "#fce7f3");
        const strokeColor = r.strand === 1 ? (isActive ? "#92400e" : "#d97706") : (isActive ? "#9d174d" : "#db2777");
        for (const { ctx: layer, highlightY } of highlightLayers) {
          if (!layer) continue;
          layer.save();
          layer.fillStyle = baseColor;
          layer.globalAlpha = isActive ? 0.9 : 0.5;
          layer.fillRect(x, highlightY, w, fullTrackH);
          layer.strokeStyle = strokeColor;
          layer.lineWidth = isActive ? 2 : 1;
          layer.strokeRect(x, highlightY, w, fullTrackH);
          layer.restore();
        }
      };

      if (r.segments && r.segments.length > 0) {
        r.segments.forEach(seg => renderMatch(seg.start, seg.end));
      } else {
        if (r.start <= r.end) {
          renderMatch(r.start, r.end);
        } else {
          renderMatch(r.start, seq.length);
          renderMatch(0, r.end);
        }
      }
    });

    // 1. Render Nucleotides
    // For very large records at low zoom, rendering one rect per base causes
    // hundreds of thousands of draw calls per frame. Switch to pixel columns.
    if (zoomLevel < 0.5) {
      const pxStart = Math.max(0, Math.floor(xScale(vStart) - scrollX));
      const pxEnd = Math.min(viewportWidth, Math.ceil(xScale(vEnd) - scrollX));

      for (let px = pxStart; px < pxEnd; px++) {
        const bp = Math.max(0, Math.min(seq.length - 1, Math.floor((scrollX + px + 0.5) / zoomLevel)));
        const char = seq[bp] || '-';
        const isGap = char === '-';
        const style = residueStyle(char, bp, comparison);
        const quiet = style === 'muted' || style === 'dot';

        ctx.fillStyle = style === 'indel' ? INDEL_FILL : isGap ? '#f1f5f9' : quiet ? MUTED_FILL : getResidueColor(char);
        ctx.globalAlpha = style === 'indel' ? 0.8 : isGap ? 0.35 : quiet ? 0.5 : 0.8;
        ctx.fillRect(px, seqY, 1.2, NT_ROW_HEIGHT);
      }
    } else {
      for (let j = vStart; j < vEnd; j++) {
        const char = seq[j] || '-';
        const isGap = char === '-';
        const cX = xScale(j) - scrollX;
        const cW = Math.max(0.1, xScale(j+1) - xScale(j));

        if (cX > viewportWidth) break;
        if (cX + cW < 0) continue;

        const highlight = highlightMap.get(j);
        const style = residueStyle(char, j, comparison);
        const lettersVisible = zoomLevel > 12;
        // With letters visible, an identical residue is just its dot on the bare track.
        const dotOnly = style === 'dot' && lettersVisible;
        if (!highlight && !dotOnly) {
          ctx.fillStyle = style === 'indel' ? INDEL_FILL : isGap ? '#f1f5f9' : style === 'normal' ? getResidueColor(char) : MUTED_FILL;
          ctx.globalAlpha = style === 'indel' ? 0.9 : isGap ? 0.5 : style === 'normal' ? 0.9 : 0.6;
          ctx.fillRect(cX, seqY, cW, NT_ROW_HEIGHT);
        }

        if (lettersVisible) {
          if (!highlight && !dotOnly) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(cX, seqY, cW, NT_ROW_HEIGHT);
          }

          ctx.globalAlpha = 1.0;
          ctx.fillStyle = highlight ? '#000'
            : style === 'indel' ? '#fff'
            : isGap ? '#94a3b8'
            : style === 'dot' ? MATCH_DOT
            : style === 'muted' ? MUTED_TEXT
            : '#fff';
          ctx.font = `600 10px ${MONO_STACK}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dotOnly && !highlight ? '·' : char, cX + cW/2, seqY + NT_ROW_HEIGHT/2);
        }
      }
    }

    const queryCtx = prepareCanvas(queryRef.current, SEARCH_QUERY_LANE_HEIGHT);
    const lettersVisible = zoomLevel > 12;
    ctx.globalAlpha = 1;
    for (const mark of marks.marks) {
      const x = xScale(mark.column) - scrollX;
      const width = Math.max(1, zoomLevel);
      if (mark.cls === 'mismatch' || mark.cls === 'deletion') {
        ctx.fillStyle = mark.cls === 'mismatch' ? '#0f172a' : '#475569';
        if (!lettersVisible && mark.cls === 'mismatch' && queryCtx) {
          queryCtx.fillStyle = '#0f172a';
          queryCtx.fillRect(x, SEARCH_QUERY_LANE_HEIGHT - 5, width, 4);
        } else ctx.fillRect(x, seqY, width, NT_ROW_HEIGHT);
        if (lettersVisible) {
          ctx.fillStyle = '#fff';
          ctx.fillText(mark.recordBase, x + zoomLevel / 2, NT_ROW_HEIGHT / 2);
        }
      } else if (lettersVisible && (mark.cls === 'ambiguity' || mark.cls === 'similar')) {
        ctx.save();
        ctx.strokeStyle = '#0f172a';
        ctx.setLineDash(mark.cls === 'ambiguity' ? [1, 2] : [3, 2]);
        if (mark.cls === 'similar') ctx.strokeRect(x + 1, 1, width - 2, NT_ROW_HEIGHT - 2);
        else { ctx.beginPath(); ctx.moveTo(x + 2, NT_ROW_HEIGHT - 3); ctx.lineTo(x + width - 2, NT_ROW_HEIGHT - 3); ctx.stroke(); }
        ctx.restore();
      }
    }
    if (queryCtx && activeInRow && lettersVisible) {
      queryCtx.font = `600 10px ${MONO_STACK}`;
      queryCtx.textAlign = 'left';
      queryCtx.fillStyle = '#475569';
      queryCtx.fillText(activeInRow.strand === -1 ? 'Query (reverse complement)' : 'Query', 4, 10);
      queryCtx.textAlign = 'center';
      for (const mark of activeMarks.marks) {
        const x = xScale(mark.column) - scrollX + zoomLevel / 2;
        queryCtx.fillStyle = mark.cls === 'mismatch' ? '#0f172a' : '#64748b';
        queryCtx.fillText(mark.queryLetter ?? '−', x, 29);
        queryCtx.fillText(matchLineSymbol(mark.cls), x, 43);
      }
    }
    for (const insertion of marks.insertions) {
      const x = xScale(insertion.afterColumn + 1) - scrollX;
      ctx.fillStyle = ctx.strokeStyle = '#7c3aed';
      ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, NT_ROW_HEIGHT); ctx.stroke();
    }
    if (queryCtx && lettersVisible) for (const insertion of activeMarks.insertions) {
      const x = xScale(insertion.afterColumn + 1) - scrollX;
      queryCtx.font = `600 10px ${MONO_STACK}`;
      queryCtx.textAlign = 'center';
      queryCtx.fillStyle = '#7c3aed';
      queryCtx.fillRect(x - insertion.bases.length * 3.5 - 2, 0, insertion.bases.length * 7 + 4, 13);
      queryCtx.fillStyle = '#fff';
      queryCtx.fillText(insertion.bases, x, 10);
    }

    // 2. Render Translation (CDS/ORF annotation features only)
    if (translationVisible) {
      features.filter(f => CDS_ORF_TYPES.includes(f.type) && typeof getFeatureStrand(f) === 'number').forEach(f => {
        const { codingSeq, alignedIndices } = extractCodingSequence(f, seq);
        const isBroken = brokenFeatureMap.get(f) ?? false;
        const translTable = parseInt(String(f.metadata?.transl_table ?? '1'), 10) || 1;

        const ctx = f.strand === 1 ? forwardCtx : reverseCtx;
        const lanes = translationLanes.laneOf.get(f);
        if (!ctx || !lanes) return;
        // Lane 0 hugs the nucleotide row: the bottom of the forward band, the top of the reverse one.
        const laneY = (lane: number) => AA_ROW_HEIGHT * (f.strand === 1 ? translationLanes.forward - 1 - lane : lane);

        const baseColor = f.strand === 1 ? '#475569' : '#be185d';

        // Prefer the annotated /translation (alt-start Met, transl_except recoding)
        // over recomputation; one residue per codon, aligned to `alignedIndices`.
        const protein = translateFeature(f, codingSeq, translTable);

        ctx.font = `600 9px ${MONO_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let j = 0; j < codingSeq.length - 2; j += 3) {
          const aa = protein[j / 3] ?? '?';
          const startIdx = alignedIndices[j];
          const endIdx = alignedIndices[j + 2];

          if (startIdx === undefined || endIdx === undefined) continue;

          const pieces = codonSpans(alignedIndices.slice(j, j + 3), originalPositions);
          const labelPiece = pieces.reduce((a, b) => b.end - b.start > a.end - a.start ? b : a);
          const firstBase = originalPositions ? originalPositions[startIdx] : startIdx;
          // Each codon sits in the row of its own frame, so a ribosomal frameshift
          // inside a join steps rows exactly where translation changes frame.
          const aaY = laneY(lanes.get(codonFrame(firstBase, f.strand)) ?? 0);

          // An early stop is a stop codon that is NOT the last codon in the sequence
          const isEarlyStop = isBroken && (aa === '_' || aa === '*') && j < codingSeq.length - 3;

          for (const piece of pieces) {
            const aX = xScale(piece.start) - scrollX;
            const aW = xScale(piece.end) - xScale(piece.start);
            if (aX + aW < 0 || aX > viewportWidth) continue;

            ctx.globalAlpha = 0.9;
            ctx.fillStyle = isEarlyStop ? '#ef4444' : baseColor;
            ctx.fillRect(aX, aaY, Math.max(1, aW), AA_ROW_HEIGHT);

            // The nucleotide cells' white hairline: it parts codons in a row and,
            // where a frameshift stacks two frames, the rows themselves.
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(aX, aaY, Math.max(1, aW), AA_ROW_HEIGHT);

            ctx.fillStyle = '#fff';
            if (piece === labelPiece) ctx.fillText(isEarlyStop ? '!' : aa, aX + aW / 2, aaY + AA_ROW_HEIGHT / 2);
          }
        }
      });
    }
  }, [seq, xScale, viewportWidth, zoomLevel, scrollX, translationVisible, translationLanes, forwardHeight, reverseHeight, moleculeType, features, brokenFeatureMap, originalPositions, searchResults, allSearchResults, currentSearchIdx, comparison, marks, activeMarks, activeInRow]);

  const canvasStyle: React.CSSProperties = {
    width: viewportWidth, position: 'absolute', top: 0, left: 0, pointerEvents: 'none',
  };
  const motionClass = showTranslation && moleculeType !== 'protein' ? 'translation-motion' : undefined;

  return <>
    {searchResults.length > 0 && <canvas ref={queryRef} aria-hidden="true"
      style={{ ...canvasStyle, height: SEARCH_QUERY_LANE_HEIGHT, transform: `translateY(${bandTop - SEARCH_QUERY_LANE_HEIGHT}px)` }} />}
    {marks.insertions.map(insertion => <button key={insertion.afterColumn} type="button"
      aria-label={`Extra query bases: ${insertion.bases} (between record positions ${insertion.flankStart} and ${insertion.flankEnd})`}
      data-tip={`Extra query bases: ${insertion.bases} (between record positions ${insertion.flankStart} and ${insertion.flankEnd})`}
      style={{ position: 'absolute', left: xScale(insertion.afterColumn + 1) - scrollX - 5, top: y - 5,
        width: 10, height: NT_ROW_HEIGHT + 5, background: 'transparent', zIndex: 2 }} />)}
    <canvas ref={canvasRef} data-hit-marks={activeMarks.marks.map(m => m.cls === 'deletion' ? '-' : matchLineSymbol(m.cls)).join('')}
      data-hit-insertions={activeMarks.insertions.map(i => i.afterColumn).join(',')} className={motionClass} data-sequence-band="" data-state={showTranslation && moleculeType !== 'protein' ? 'translation-enabled' : 'translation-disabled'}
      style={{ ...canvasStyle, height: NT_ROW_HEIGHT, transform: `translateY(${y}px)` }} />
    {moleculeType !== 'protein' && <>
      <canvas ref={forwardRef} data-translation-band="forward" className="translation-band" aria-hidden={!translationVisible}
        style={{ ...canvasStyle, height: forwardHeight, opacity: translationVisible ? 1 : 0,
          transform: `translateY(${bandTop + (translationVisible ? 0 : 3)}px)` }} />
      <canvas ref={reverseRef} data-translation-band="reverse" className="translation-band" aria-hidden={!translationVisible}
        style={{ ...canvasStyle, height: reverseHeight, opacity: translationVisible ? 1 : 0,
          transform: `translateY(${y + NT_ROW_HEIGHT}px)` }} />
    </>}
  </>;
});
