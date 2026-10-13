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

import * as d3 from 'd3';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import type { BioFeature, SearchResult } from '@/src/domain/bio/types';
import { getAminoAcidColor, getNucleotideColor } from '@/src/app/shared/viewer/colors';
import { alignedToOriginalPositions, extractCodingSequence, translateFeature } from '@/src/domain/bio';
import { NT_ROW_HEIGHT, AA_ROW_HEIGHT, MONO_STACK, TRANSLATION_MIN_ZOOM } from '../constants';
import { CDS_ORF_TYPES, computeBrokenFeatureMap, codonFrame, type TranslationLanes } from '../cds';

export interface SequenceTrackProps {
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
}

export const SequenceTrack: React.FC<SequenceTrackProps> = memo(({ 
  seq, moleculeType, xScale, viewportWidth, y, zoomLevel, scrollX, showTranslation, features, translationLanes,
  conservationScores, showConservation, searchResults, allSearchResults, currentSearchIdx
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const forwardRef = useRef<HTMLCanvasElement>(null);
  const reverseRef = useRef<HTMLCanvasElement>(null);
  const translationVisible = showTranslation && zoomLevel > TRANSLATION_MIN_ZOOM && moleculeType !== 'protein';
  const forwardHeight = AA_ROW_HEIGHT * translationLanes.forward;
  const reverseHeight = AA_ROW_HEIGHT * translationLanes.reverse;
  const bandTop = y - (translationVisible ? forwardHeight : 0);


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
    searchResults.forEach(r => {
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

        ctx.fillStyle = isGap ? '#f1f5f9' : getResidueColor(char);
        ctx.globalAlpha = isGap ? 0.35 : 0.8;
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
        if (!highlight) {
          ctx.fillStyle = isGap ? '#f1f5f9' : getResidueColor(char);
          ctx.globalAlpha = isGap ? 0.5 : 0.9;
          ctx.fillRect(cX, seqY, cW, NT_ROW_HEIGHT);
        }

        if (zoomLevel > 12) {
          if (!highlight) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(cX, seqY, cW, NT_ROW_HEIGHT);
          }

          ctx.globalAlpha = 1.0;
          ctx.fillStyle = (isGap && !highlight) ? '#94a3b8' : (highlight ? '#000' : '#fff');
          ctx.font = `600 10px ${MONO_STACK}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(char, cX + cW/2, seqY + NT_ROW_HEIGHT/2);
        }
      }
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

          const lo = Math.min(startIdx, endIdx);
          const aX = xScale(lo) - scrollX;
          const aW = xScale(Math.max(startIdx, endIdx) + 1) - xScale(lo);
          const firstBase = originalPositions ? originalPositions[startIdx] : startIdx;
          // Each codon sits in the row of its own frame, so a ribosomal frameshift
          // inside a join steps rows exactly where translation changes frame.
          const aaY = laneY(lanes.get(codonFrame(firstBase, f.strand)) ?? 0);

          if (aX + aW < 0 || aX > viewportWidth) continue;

          // An early stop is a stop codon that is NOT the last codon in the sequence
          const isEarlyStop = isBroken && (aa === '_' || aa === '*') && j < codingSeq.length - 3;

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
          ctx.fillText(isEarlyStop ? '!' : aa, aX + aW / 2, aaY + AA_ROW_HEIGHT / 2);
        }
      });
    }
  }, [seq, xScale, viewportWidth, zoomLevel, scrollX, translationVisible, translationLanes, forwardHeight, reverseHeight, moleculeType, features, brokenFeatureMap, originalPositions, searchResults, allSearchResults, currentSearchIdx]);

  const canvasStyle: React.CSSProperties = {
    width: viewportWidth, position: 'absolute', top: 0, left: 0, pointerEvents: 'none',
  };
  const motionClass = showTranslation && moleculeType !== 'protein' ? 'translation-motion' : undefined;

  return <>
    <canvas ref={canvasRef} className={motionClass} data-sequence-band=""
      style={{ ...canvasStyle, height: NT_ROW_HEIGHT, transform: `translateY(${y}px)` }} />
    {moleculeType !== 'protein' && <>
      <canvas ref={forwardRef} className="translation-band" aria-hidden={!translationVisible}
        style={{ ...canvasStyle, height: forwardHeight, opacity: translationVisible ? 1 : 0,
          transform: `translateY(${bandTop + (translationVisible ? 0 : 3)}px)` }} />
      <canvas ref={reverseRef} className="translation-band" aria-hidden={!translationVisible}
        style={{ ...canvasStyle, height: reverseHeight, opacity: translationVisible ? 1 : 0,
          transform: `translateY(${y + NT_ROW_HEIGHT}px)` }} />
    </>}
  </>;
});
