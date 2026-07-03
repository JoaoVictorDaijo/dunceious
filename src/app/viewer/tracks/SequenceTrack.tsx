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
import React, { memo, useEffect, useMemo, useRef } from 'react';
import type { BioFeature, SearchResult } from '@/src/domain/bio/types';
import { getAminoAcidColor, getNucleotideColor } from '@/src/app/viewer/colors';
import { extractCodingSequence, translateSequence } from '@/src/domain/bio';
import { NT_ROW_HEIGHT, AA_ROW_HEIGHT } from '../constants';
import { CDS_ORF_TYPES, computeBrokenFeatureMap } from '../cds';

export interface SequenceTrackProps {
  seq: string;
  moleculeType?: 'dna' | 'rna' | 'protein';
  xScale: d3.ScaleLinear<number, number>;
  viewportWidth: number;
  height: number;
  y: number;
  zoomLevel: number;
  scrollX: number;
  showTranslation: boolean;
  features: BioFeature[];
  conservationScores?: number[];
  showConservation?: boolean;
  searchResults: SearchResult[];
  allSearchResults: SearchResult[];
  currentSearchIdx: number;
}

export const SequenceTrack: React.FC<SequenceTrackProps> = memo(({ 
  seq, moleculeType, xScale, viewportWidth, height, y, zoomLevel, scrollX, showTranslation, features,
  conservationScores, showConservation, searchResults, allSearchResults, currentSearchIdx
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pre-compute broken-protein status for each CDS/ORF feature.
  // Keyed by `${start}-${end}-${strand}` to avoid re-running on unrelated re-renders.
  const brokenFeatureMap = useMemo(
    () => (showTranslation ? computeBrokenFeatureMap(features, seq) : new Map<string, boolean>()),
    [features, seq, showTranslation],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, viewportWidth, height);
    
    const seqY = y;
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
    const fullTrackH = (showTranslation ? AA_ROW_HEIGHT * 6 : 0) + NT_ROW_HEIGHT;
    const highlightY = showTranslation ? y - AA_ROW_HEIGHT * 3 : y;
    searchResults.forEach(r => {
      const isActive = r === activeResult;
      
      const renderMatch = (start: number, end: number) => {
        const x = xScale(start) - scrollX;
        const w = xScale(end) - xScale(start);
        if (x + w < 0 || x > viewportWidth) return;

        const baseColor = r.strand === 1 ? (isActive ? "#fbbf24" : "#fef3c7") : (isActive ? "#f472b6" : "#fce7f3");
        ctx.save();
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = isActive ? 0.9 : 0.5;
        ctx.fillRect(x, highlightY, w, fullTrackH);

        const strokeColor = r.strand === 1 ? (isActive ? "#92400e" : "#d97706") : (isActive ? "#9d174d" : "#db2777");
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.strokeRect(x, highlightY, w, fullTrackH);
        ctx.restore();
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
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(char, cX + cW/2, seqY + NT_ROW_HEIGHT/2);
        }
      }
    }

    // 2. Render Translation (CDS/ORF annotation features only)
    if (showTranslation && zoomLevel > 5) {
      features.filter(f => CDS_ORF_TYPES.includes(f.type)).forEach(f => {
        const { codingSeq, alignedIndices } = extractCodingSequence(f, seq);
        const isBroken = brokenFeatureMap.get(`${f.start}-${f.end}-${f.strand}`) ?? false;

        const frame = f.strand === 1 ? (f.start % 3) : (f.end % 3);
        const aaY = f.strand === 1
          ? y - AA_ROW_HEIGHT * (3 - frame)
          : y + NT_ROW_HEIGHT + AA_ROW_HEIGHT * frame;

        const baseColor = f.strand === 1 ? '#475569' : '#be185d';

        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let j = 0; j < codingSeq.length - 2; j += 3) {
          const aa = translateSequence(codingSeq.substring(j, j + 3));
          const startIdx = alignedIndices[j];
          const endIdx = alignedIndices[j + 2];

          if (startIdx === undefined || endIdx === undefined) continue;

          const aX = xScale(Math.min(startIdx, endIdx)) - scrollX;
          const aW = xScale(Math.max(startIdx, endIdx) + 1) - xScale(Math.min(startIdx, endIdx));

          if (aX + aW < 0 || aX > viewportWidth) continue;

          // An early stop is a stop codon that is NOT the last codon in the sequence
          const isEarlyStop = isBroken && aa === '_' && j < codingSeq.length - 3;

          ctx.globalAlpha = 0.9;
          ctx.fillStyle = isEarlyStop ? '#ef4444' : baseColor;
          ctx.fillRect(aX, aaY, Math.max(1, aW), AA_ROW_HEIGHT);

          ctx.globalAlpha = 1.0;
          ctx.fillStyle = '#fff';
          ctx.fillText(isEarlyStop ? '!' : aa, aX + aW / 2, aaY + AA_ROW_HEIGHT / 2);
        }
      });
    }
  }, [seq, xScale, viewportWidth, height, y, zoomLevel, scrollX, showTranslation, features, brokenFeatureMap, searchResults, allSearchResults, currentSearchIdx]);

  return <canvas ref={canvasRef} style={{ width: viewportWidth, height: height, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />;
});
