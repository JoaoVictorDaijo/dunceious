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
import React, { memo, useMemo } from 'react';
import type { ListChildComponentProps } from 'react-window';
import type { BioFeature, FeatureSegment, SearchResult, SelectionArea } from '@/src/domain/bio/types';
import { getFeatureColor } from '@/src/app/viewer/colors';
import { computeBrokenFeatureMap } from './cds';
import { ANNOT_ROW_HEIGHT, NT_ROW_HEIGHT, AA_ROW_HEIGHT } from './constants';
import type { RecordLayout, TrackLayout, FeaturePlacement, TrackDatum } from './layout';
import { SequenceTrack } from './tracks/SequenceTrack';
import { QuantitativeTrack, TRACK_COLORS } from './tracks/QuantitativeTrack';

export interface RowData {
  recordLayouts: RecordLayout[];
  alignmentLength: number;
  scrollX: number;
  zoomLevel: number;
  viewportWidth: number;
  persistentSelection: SelectionArea | null;
  showAnnotations: boolean;
  showTranslation: boolean;
  searchResultsByRecord: Record<string, SearchResult[]>;
  searchResults: SearchResult[];
  currentSearchIdx: number;
  onSelectionChange: (selection: SelectionArea | null) => void;
  onContextMenu: (e: React.MouseEvent, recordId: string, feature?: BioFeature) => void;
  onViewDetails: (recordId: string, feature?: BioFeature) => void;
  setTooltip: (tooltip: { x: number, y: number, content: string } | null) => void;
  customColors?: Record<string, string>;
  showConservation: boolean;
  conservationScores: number[];
  quantValueRanges: Record<string, { min: number, max: number }>;
  showTracks: boolean;
}

export const Row = memo(({ index, style, data }: ListChildComponentProps<RowData>) => {
  const { 
    recordLayouts, alignmentLength, scrollX, zoomLevel, viewportWidth, 
    persistentSelection, showAnnotations, showTranslation, 
    searchResultsByRecord, searchResults, currentSearchIdx,
    onSelectionChange, onContextMenu, onViewDetails, setTooltip, customColors,
    showConservation, conservationScores,
    quantValueRanges,
    showTracks
  } = data;

  const l = recordLayouts[index];
  const chartWidth = alignmentLength * zoomLevel;
  const xScale = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);
  
  const vStart = Math.max(0, Math.floor(scrollX / zoomLevel) - 30);
  const vEnd = Math.min(alignmentLength, Math.ceil((scrollX + viewportWidth) / zoomLevel) + 30);

  const seq = l.record.alignedSequence || l.record.sequence;
  const rowSearchResults = searchResultsByRecord[l.id] || [];
  const tracks = l.record.tracks || [];

  const effectiveTranslation = showTranslation && l.record.moleculeType !== 'protein';

  // Pre-compute broken-protein status for each CDS/ORF feature in this record.
  const brokenFeatureMap = useMemo(
    () => computeBrokenFeatureMap(l.record.features, seq),
    [l.record.features, seq],
  );

  return (
    <div 
      style={style} 
      className="flex group hover:bg-sky-50/20 transition-colors relative border-b border-slate-100"
      onContextMenu={(e) => onContextMenu(e, l.id)}
    >
      {/* SIDEBAR (Sticky Names) */}
      <div className="w-[120px] flex-none bg-slate-50 border-r border-slate-200 z-10 select-none flex flex-col items-end px-2 shrink-0 relative">
        {showAnnotations && l.annotHeight > 0 && (
          <>
            <div className="absolute right-0 w-1 bg-slate-200" style={{ top: 0, height: l.annotHeight + l.topPadding }} />
            <div className="absolute right-2 flex items-center" style={{ top: 4, height: 12 }}>
              <span className="text-[6px] font-black uppercase text-slate-400 tracking-widest">Annot</span>
            </div>
          </>
        )}
        
        {showTracks && tracks.length > 0 && (
          <>
            <div className="absolute right-0 w-1 bg-indigo-400/30" style={{ top: l.annotHeight + l.topPadding, height: l.quantHeight }} />
            <div className="absolute right-2 flex items-center" style={{ top: l.annotHeight + l.topPadding - 12, height: 12 }}>
              <span className="text-[6px] font-black uppercase text-indigo-400 tracking-widest">Tracks</span>
            </div>
            {/* Track Legends */}
            <div className="absolute left-0 right-2 flex flex-col items-end pointer-events-none" style={{ top: l.annotHeight + l.topPadding }}>
              {l.trackLayouts.map((t: TrackLayout) => {
                const range = quantValueRanges[t.id] || { min: 0, max: 1 };
                return (
                  <div key={t.id} className="flex flex-col justify-center items-end" style={{ height: t.height, marginBottom: 12 }}>
                    <span className="text-[7px] font-bold text-slate-500">{range.max.toFixed(1)}</span>
                    {t.kind === 'interval' ? (
                      <div 
                        className="w-16 h-1.5 my-0.5 rounded-[1px]" 
                        style={{ background: 'linear-gradient(to right, #440154, #21918c, #fde725)' }} 
                      />
                    ) : (
                      <div className="w-16 h-[1px] my-1 bg-indigo-400/50" />
                    )}
                    <span className="text-[7px] font-bold text-slate-500">{range.min.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="absolute right-0 w-1 bg-emerald-400/30" style={{ top: l.seqBaseY - (effectiveTranslation ? AA_ROW_HEIGHT * 3 : 0), height: (effectiveTranslation ? AA_ROW_HEIGHT * 6 : 0) + NT_ROW_HEIGHT }} />
        <div className="absolute right-2 flex items-center" style={{ top: l.seqBaseY - (effectiveTranslation ? AA_ROW_HEIGHT * 3 : 0) - 12, height: 12 }}>
          <span className="text-[6px] font-black uppercase text-emerald-500 tracking-widest">Sequence</span>
        </div>

        {effectiveTranslation && (
          <div className="absolute left-0 right-2 flex flex-col items-end pointer-events-none" style={{ top: l.seqBaseY - AA_ROW_HEIGHT * 3 }}>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">F1</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">F2</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">F3</span>
          </div>
        )}
        <div className="w-full truncate text-right bg-white px-2 py-1.5 rounded-md border border-slate-200 text-[9px] font-black text-slate-900 shadow-sm tracking-tight" title={l.id} style={{ marginTop: l.seqBaseY + 2 }}>
          {l.id}
        </div>
        {effectiveTranslation && (
          <div className="absolute left-0 right-2 flex flex-col items-end pointer-events-none" style={{ top: l.seqBaseY + NT_ROW_HEIGHT }}>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">R1</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">R2</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">R3</span>
          </div>
        )}
      </div>

      {/* SEQUENCE CONTENT AREA */}
      <div className="flex-1 overflow-hidden bg-white relative">
        <div style={{ width: viewportWidth, height: l.height, position: 'relative' }}>
          {/* Section Backgrounds & Labels */}
          {showAnnotations && l.annotHeight > 0 && (
            <div className="absolute left-0 right-0 bg-slate-50/30 border-b border-slate-100/50" style={{ top: 0, height: l.annotHeight + l.topPadding }}>
              <div className="absolute left-2 z-30 pointer-events-none" style={{ top: 4 }}>
                <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest">Annotations</span>
              </div>
            </div>
          )}
          
          {showTracks && tracks.length > 0 && (
            <div className="absolute left-2 z-30 pointer-events-none" style={{ top: l.annotHeight + l.topPadding - 12 }}>
              <span className="text-[7px] font-black uppercase text-indigo-400 tracking-widest">Quantitative Tracks</span>
            </div>
          )}

          <SequenceTrack 
            seq={seq}
            moleculeType={l.record.moleculeType}
            xScale={xScale}
            viewportWidth={viewportWidth}
            height={l.height}
            y={l.seqBaseY}
            zoomLevel={zoomLevel}
            scrollX={scrollX}
            showTranslation={effectiveTranslation}
            features={l.record.features}
            showConservation={showConservation}
            conservationScores={conservationScores}
            searchResults={rowSearchResults}
            allSearchResults={searchResults}
            currentSearchIdx={currentSearchIdx}
          />
          <svg width={viewportWidth} height={l.height} style={{ position: 'absolute', top: 0, left: 0, zIndex: 5 }}>
            {/* Background Grid */}
            {(() => {
              const tickValues = xScale.ticks(Math.max(5, Math.floor(viewportWidth / 120)));
              return tickValues.map(t => {
                const x = xScale(t) - scrollX;
                if (x < 0 || x > viewportWidth) return null;
                return <line key={t} x1={x} y1={0} x2={x} y2={l.height} stroke="#f1f5f9" strokeWidth={1} />;
              });
            })()}

            {/* Selection Backgrounds (Row Specific) */}
            {persistentSelection && persistentSelection.recordIds.includes(l.id) && (
              (() => {
                const s = xScale(persistentSelection.start) - scrollX;
                const e = xScale(persistentSelection.end) - scrollX;
                
                if (persistentSelection.start <= persistentSelection.end) {
                  if (s > viewportWidth || e < 0) return null;
                  return (
                    <rect 
                      x={Math.max(0, s)} 
                      y={0} 
                      width={Math.min(viewportWidth - Math.max(0, s), e - Math.max(0, s))} 
                      height={l.height} 
                      fill="#3b82f6" 
                      opacity={0.08} 
                    />
                  );
                } else {
                  const e1 = xScale(alignmentLength) - scrollX;
                  const e2 = xScale(persistentSelection.end) - scrollX;
                  return (
                    <React.Fragment>
                      {s < viewportWidth && (
                        <rect x={Math.max(0, s)} y={0} width={Math.min(viewportWidth, e1) - Math.max(0, s)} height={l.height} fill="#3b82f6" opacity={0.08} />
                      )}
                      {e2 > 0 && (
                        <rect x={0} y={0} width={Math.min(viewportWidth, e2)} height={l.height} fill="#3b82f6" opacity={0.08} />
                      )}
                    </React.Fragment>
                  );
                }
              })()
            )}
            
            {/* Annotations */}
            {showAnnotations && l.placements.map((p: FeaturePlacement, i: number) => {
              const f = p.feature;
              const isWrap = f.start > f.end;
              
              // Visibility check: if the feature is completely outside the viewport
              // For wrapped features, they are almost always visible if the sequence is visible, 
              // but we can be more precise.
              if (!isWrap) {
                if (f.end < vStart || f.start > vEnd) return null;
              } else {
                // Wrapped feature: visible if [start, len] or [0, end] overlaps [vStart, vEnd]
                const part1Visible = f.start <= vEnd && alignmentLength >= vStart;
                const part2Visible = 0 <= vEnd && f.end >= vStart;
                if (!part1Visible && !part2Visible) return null;
              }

              const y = p.row * (ANNOT_ROW_HEIGHT + 6) + l.topPadding;
              const isSelected = persistentSelection && f.start === persistentSelection.start && f.end === persistentSelection.end;

              // Look up broken-protein status from the pre-computed map (for CDS/ORF features)
              const isBroken = brokenFeatureMap.get(`${f.start}-${f.end}-${f.strand}`) ?? false;

              const tooltipContent = [
                `${f.name} [${f.type}]`,
                isBroken ? '⚠ Early stop codon (broken protein)' : null,
                f.metadata?.value ? `Value: ${f.metadata.value}` : null,
                `Locus: ${f.locationString || `${f.start + 1}..${f.end}`}`,
                `Strand: ${f.strand === 1 ? '+' : '-'}`,
                f.metadata?.product ? `Product: ${f.metadata.product}` : null,
                f.metadata?.note ? `Note: ${f.metadata.note}` : null
              ].filter(Boolean).join('\n');

              const renderPart = (s: number, e: number, keySuffix: string) => {
                const fX = xScale(s) - scrollX, fW = xScale(e) - xScale(s);
                if (fX > viewportWidth || fX + fW < 0) return null;

                if (f.type === 'quantitative_data') return null; // Handled by QuantitativeTrack

                let rectHeight = ANNOT_ROW_HEIGHT;
                let rectY = y;
                let fill = f.color || getFeatureColor(f.type, customColors);

                return (
                  <rect 
                    key={`${i}-${keySuffix}`}
                    x={fX} y={rectY} width={Math.max(1, fW)} height={rectHeight}
                    fill={fill} rx={4}
                    stroke={isSelected ? '#000' : (isBroken ? '#ef4444' : 'none')}
                    strokeWidth={isSelected ? 1 : (isBroken ? 1.5 : 0)}
                    strokeDasharray={isBroken && !isSelected ? '3,2' : undefined}
                    style={{ cursor: 'pointer' }} opacity={isSelected ? 1 : 0.85}
                    onMouseOver={(ev) => setTooltip({ x: ev.pageX, y: ev.pageY, content: tooltipContent })}
                    onMouseOut={() => setTooltip(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onViewDetails?.(l.id, f);
                    }}
                    onContextMenu={(ev) => {
                      ev.stopPropagation();
                      onContextMenu(ev, l.id, f);
                    }}
                    onDoubleClick={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                      onSelectionChange({ start: f.start, end: f.end, recordIds: [l.id] });
                    }}
                  />
                );
              };

              if (f.segments && f.segments.length > 0) {
                const firstSeg = f.segments[0];
                const lastSeg = f.segments[f.segments.length - 1];
                const lineY = y + ANNOT_ROW_HEIGHT / 2;
                
                // Draw connecting lines between segments
                const connectingLines: React.ReactElement[] = [];
                for (let idx = 0; idx < f.segments.length - 1; idx++) {
                  const s1 = f.segments[idx];
                  const s2 = f.segments[idx + 1];

                  // parseLocation sets a descending envelope only for a vetted origin
                  // wrap, so trust it over pair order: a scattered join descends too.
                  if (isWrap && s1.end > s2.start) {
                    // Wrap around connection (end of genome to start of genome)
                    const x1 = xScale(s1.end) - scrollX;
                    const xEnd = xScale(alignmentLength) - scrollX;
                    const xStart = xScale(0) - scrollX;
                    const x2 = xScale(s2.start) - scrollX;

                    if (xEnd > 0 && x1 < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-wrap-1-${idx}`}
                          x1={Math.max(0, x1)} y1={lineY} x2={Math.min(viewportWidth, xEnd)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                    if (x2 > 0 && xStart < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-wrap-2-${idx}`}
                          x1={Math.max(0, xStart)} y1={lineY} x2={Math.min(viewportWidth, x2)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                  } else {
                    const gapStart = Math.min(s1.end, s2.end);
                    const gapEnd = Math.max(s1.start, s2.start);
                    const x1 = xScale(gapStart) - scrollX;
                    const x2 = xScale(gapEnd) - scrollX;
                    if (gapEnd > gapStart && x2 > 0 && x1 < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-${idx}`}
                          x1={Math.max(0, x1)} y1={lineY} x2={Math.min(viewportWidth, x2)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                  }
                }
                
                return (
                  <React.Fragment key={i}>
                    {connectingLines}
                    {f.segments.map((seg: FeatureSegment, idx: number) => renderPart(seg.start, seg.end, `seg-${idx}`))}
                  </React.Fragment>
                );
              }

              if (isWrap) {
                return (
                  <React.Fragment key={i}>
                    {renderPart(f.start, alignmentLength, 'p1')}
                    {renderPart(0, f.end, 'p2')}
                  </React.Fragment>
                );
              }
              return renderPart(f.start, f.end, 'p1');
            })}

          </svg>

          {/* Quantitative Tracks - Rendered after SVG to be on top */}
          {showTracks && l.trackLayouts.map((track: TrackLayout, idx: number) => {
            const trackColor = track.color || TRACK_COLORS[idx % TRACK_COLORS.length];
            const trackTop = l.annotHeight + l.topPadding + track.top;
            return (
              <div 
                key={track.id} 
                className="absolute left-0 right-0 border border-slate-200/60 bg-white/60 rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.05)] group/track z-30 mx-0.5" 
                style={{ height: track.height, top: trackTop }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const bp = xScale.invert(x + scrollX);
                  const nearest = track.data.find((d: TrackDatum) => bp >= d.start && bp <= d.end);
                  if (nearest) {
                    setTooltip({ 
                      x: e.pageX, 
                      y: e.pageY, 
                      content: `${track.name}\nPos: ${Math.floor(bp) + 1}\nValue: ${nearest.value}` 
                    });
                  } else {
                    setTooltip(null);
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const bp = xScale.invert(x + scrollX);
                  const nearest = track.data.find((d: TrackDatum) => bp >= d.start && bp <= d.end);
                  if (nearest) {
                    onSelectionChange({ start: nearest.start, end: nearest.end, recordIds: [l.id] });
                  }
                }}
              >
                <div className="absolute left-2 top-2 z-10">
                  <span 
                    className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded border shadow-sm"
                    style={{ 
                      color: trackColor, 
                      backgroundColor: '#fff',
                      borderColor: `${trackColor}40`
                    }}
                  >
                    {track.name}
                  </span>
                </div>
                <QuantitativeTrack 
                  data={track.data}
                  viewportWidth={viewportWidth}
                  height={track.height}
                  xScale={xScale}
                  scrollX={scrollX}
                  minVal={quantValueRanges[track.id]?.min || 0}
                  maxVal={quantValueRanges[track.id]?.max || 1}
                  color={trackColor}
                  kind={track.kind}
                  packedRows={track.packedRows}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
