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
import type { FocusTarget } from '@/src/app/shared/logic/focusTarget';
import { getFeatureColor } from '@/src/app/shared/viewer/colors';
import { AnnotationText } from './AnnotationText';
import { annotationBarPath, annotationDirection, frameshiftLabel, frameshiftSummary, showsAnnotationBases } from './annotationPresentation';
import { segmentFrameshifts } from '@/src/domain/bio';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { getOriginalPos } from '@/src/domain/bio/sequence';
import { computeBrokenFeatureMap } from './cds';
import { ANNOT_BAR_HEIGHT, ANNOT_BASES_HEIGHT, NT_ROW_HEIGHT, AA_ROW_HEIGHT } from './constants';
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
  /** 0..1: how far opted-in annotation bars have opened to show their bases. */
  basesOpenness: number;
  /** The focused annotation, while the selection is still exactly that region. */
  focusedRegion: FocusTarget | null;
}

const SELECTION_FILL = '#38bdf8';
const SELECTION_EDGE = '#0ea5e9';
/** Where the "Annotations" heading ends; a focus label starting before it takes the heading's place. */
const ANNOT_HEADING_END = 84;

export const Row = memo(({ index, style, data }: ListChildComponentProps<RowData>) => {
  const { 
    recordLayouts, alignmentLength, scrollX, zoomLevel, viewportWidth, 
    persistentSelection, showAnnotations, showTranslation, 
    searchResultsByRecord, searchResults, currentSearchIdx,
    onSelectionChange, onContextMenu, onViewDetails, setTooltip, customColors,
    showConservation, conservationScores,
    quantValueRanges,
    showTracks, basesOpenness, focusedRegion
  } = data;

  const l = recordLayouts[index];
  const chartWidth = alignmentLength * zoomLevel;
  const xScale = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);
  
  const vStart = Math.max(0, Math.floor(scrollX / zoomLevel) - 30);
  const vEnd = Math.min(alignmentLength, Math.ceil((scrollX + viewportWidth) / zoomLevel) + 30);

  const seq = l.record.alignedSequence || l.record.sequence;
  const lastBaseEnd = useMemo(() => {
    let end = seq.length;
    while (end > 0 && seq[end - 1] === '-') end--;
    return end;
  }, [seq]);
  const rowSearchResults = searchResultsByRecord[l.id] || [];
  const tracks = l.record.tracks || [];

  const effectiveTranslation = l.translationVisible;
  const motionClass = showTranslation && l.record.moleculeType !== 'protein' ? 'translation-motion' : '';
  const lanes = l.translationLanes;
  const bandTop = l.seqBaseY - (effectiveTranslation ? AA_ROW_HEIGHT * lanes.forward : 0);
  const rowTop = typeof style.top === 'number' ? `${style.top}px` : (style.top ?? '0px');

  // The focus label rides the region's visible start, holding at the view edge while that start is scrolled away.
  const focusLabelLeft = (() => {
    if (!focusedRegion || focusedRegion.recordId !== l.id) return null;
    const s = xScale(focusedRegion.start) - scrollX;
    const e = xScale(focusedRegion.end) - scrollX;
    if (focusedRegion.start > focusedRegion.end) return s < viewportWidth ? Math.max(0, s) : e > 0 ? 0 : null;
    return s <= viewportWidth && e >= 0 ? Math.max(0, s) : null;
  })();
  const showAnnotHeading = focusLabelLeft === null || focusLabelLeft >= ANNOT_HEADING_END;

  // Pre-compute broken-protein status for each CDS/ORF feature in this record.
  const brokenFeatureMap = useMemo(
    () => computeBrokenFeatureMap(l.record.features, seq, l.record.moleculeType),
    [l.record.features, seq, l.record.moleculeType],
  );

  return (
    <div 
      style={{ ...style, top: 0, transform: `translateY(${rowTop})` }}
      className={`flex group hover:bg-sky-50/20 transition-colors relative border-b border-slate-100 ${motionClass}`}
      onContextMenu={(e) => onContextMenu(e, l.id)}
    >
      {/* SIDEBAR (Sticky Names) */}
      <div className="w-[120px] flex-none bg-slate-50 border-r border-slate-200 z-10 select-none flex flex-col items-end px-2 shrink-0 relative">
        {showAnnotations && l.annotHeight > 0 && (
          <>
            <div className="absolute right-0 w-1 bg-slate-200" style={{ top: 0, height: l.annotHeight + l.topPadding }} />
            <div className="absolute right-2 flex items-center" style={{ top: 4, height: 12 }}>
              <span className="text-[8px] font-bold uppercase text-slate-400 tracking-widest">Annot</span>
            </div>
          </>
        )}
        
        {showTracks && tracks.length > 0 && (
          <>
            <div className="absolute right-0 w-1 bg-indigo-400/30" style={{ top: l.annotHeight + l.topPadding, height: l.quantHeight }} />
            <div className="absolute right-2 flex items-center" style={{ top: l.annotHeight + l.topPadding - 12, height: 12 }}>
              <span className="text-[8px] font-bold uppercase text-indigo-400 tracking-widest">Tracks</span>
            </div>
            {/* Track Legends */}
            <div className="absolute left-0 right-2 flex flex-col items-end pointer-events-none" style={{ top: l.annotHeight + l.topPadding }}>
              {l.trackLayouts.map((t: TrackLayout) => {
                const range = quantValueRanges[t.id] || { min: 0, max: 1 };
                return (
                  <div key={t.id} className="flex flex-col justify-center items-end" style={{ height: t.height, marginBottom: 12 }}>
                    <span className="text-[8px] font-bold text-slate-500">{range.max.toFixed(1)}</span>
                    {t.kind === 'interval' ? (
                      <div 
                        className="w-16 h-1.5 my-0.5 rounded-[1px]" 
                        style={{ background: 'linear-gradient(to right, #440154, #21918c, #fde725)' }} 
                      />
                    ) : (
                      <div className="w-16 h-[1px] my-1 bg-indigo-400/50" />
                    )}
                    <span className="text-[8px] font-bold text-slate-500">{range.min.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className={`absolute right-0 w-1 bg-emerald-400/30 ${motionClass}`}
          style={{ top: 0, height: 1, transformOrigin: 'top',
            transform: `translateY(${bandTop}px) scaleY(${(effectiveTranslation ? AA_ROW_HEIGHT * (lanes.forward + lanes.reverse) : 0) + NT_ROW_HEIGHT})` }} />
        <div className="absolute right-2 flex items-center" style={{ top: bandTop - 12, height: 12 }}>
          <span className="text-[8px] font-bold uppercase text-emerald-500 tracking-widest">Sequence</span>
        </div>

        <div className={`w-full truncate text-right bg-white px-2 py-1.5 rounded-md border border-slate-200 text-[9px] font-bold text-slate-900 shadow-sm tracking-tight ${motionClass}`} data-tip={l.id} style={{ transform: `translateY(${l.seqBaseY + 2}px)` }}>
          {l.id}
        </div>
      </div>

      {/* SEQUENCE CONTENT AREA */}
      <div className={`flex-1 bg-white relative ${motionClass ? 'overflow-x-clip' : 'overflow-hidden'}`}>
        <div style={{ width: viewportWidth, height: l.height, position: 'relative' }}>
          {/* Section Backgrounds & Labels */}
          {showAnnotations && l.annotHeight > 0 && (
            <div className="absolute left-0 right-0 bg-slate-50/30 border-b border-slate-100/50" style={{ top: 0, height: l.annotHeight + l.topPadding }}>
              {showAnnotHeading && (
                <div className="absolute left-2 z-30 pointer-events-none" style={{ top: 4 }}>
                  <span className="text-[8px] font-bold uppercase text-slate-400 tracking-widest">Annotations</span>
                </div>
              )}
            </div>
          )}
          
          {showTracks && tracks.length > 0 && (
            <div className="absolute left-2 z-30 pointer-events-none" style={{ top: l.annotHeight + l.topPadding - 12 }}>
              <span className="text-[8px] font-bold uppercase text-indigo-400 tracking-widest">Quantitative Tracks</span>
            </div>
          )}

          <SequenceTrack 
            seq={seq}
            moleculeType={l.record.moleculeType}
            xScale={xScale}
            viewportWidth={viewportWidth}
            y={l.seqBaseY}
            zoomLevel={zoomLevel}
            scrollX={scrollX}
            showTranslation={showTranslation}
            features={l.record.features}
            translationLanes={lanes}
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
                const band = (x1: number, x2: number) => {
                  const x = Math.max(0, x1);
                  const width = Math.min(viewportWidth, x2) - x;
                  return width > 0 && <rect data-selection-band x={x} y={0} width={width} height={l.height} fill={SELECTION_FILL} opacity={0.14} />;
                };
                const edge = (x: number) => x >= 0 && x <= viewportWidth && (
                  <line data-selection-edge x1={x} x2={x} y1={0} y2={l.height} stroke={SELECTION_EDGE} strokeWidth={1.5} />
                );
                const wraps = persistentSelection.start > persistentSelection.end;
                return (
                  <React.Fragment>
                    {wraps ? <>{band(s, xScale(alignmentLength) - scrollX)}{band(-scrollX, e)}</> : band(s, e)}
                    {edge(s)}
                    {edge(e)}
                  </React.Fragment>
                );
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
                const part1Visible = f.start <= vEnd && seq.length >= vStart;
                const part2Visible = 0 <= vEnd && f.end >= vStart;
                if (!part1Visible && !part2Visible) return null;
              }

              // Each feature sits in a <g> placed by transform so lane moves animate
              // (see .annot-feature); everything inside draws from y = 0.
              const laneY = l.laneTops[p.row] + l.topPadding;
              const y = 0;
              const openness = showsAnnotationBases(f) ? basesOpenness : 0;
              const expanded = openness > 0;
              const barHeight = ANNOT_BAR_HEIGHT + openness * ANNOT_BASES_HEIGHT;
              const place = (node: React.ReactNode) => (
                <g key={i} className="annot-feature" style={{ transform: `translateY(${laneY}px)` }}>{node}</g>
              );
              const isSelected = persistentSelection && f.start === persistentSelection.start && f.end === persistentSelection.end;

              // Look up broken-protein status from the pre-computed map (for CDS/ORF features)
              const isBroken = brokenFeatureMap.get(f) ?? false;

              const tooltipContent = () => [
                `${f.name} [${f.type}]`,
                isBroken ? '⚠ Early stop codon (broken protein)' : null,
                f.metadata?.value ? `Value: ${f.metadata.value}` : null,
                `Locus: ${f.locationString || `${getOriginalPos(seq, f.start) + 1}..${getOriginalPos(seq, f.end)}`}`,
                annotationDirection(f, l.record.moleculeType),
                ...frameshiftSummary(f),
                'Bases: annotated region segments at genomic positions; zoom in to inspect.',
                f.metadata?.product ? `Product: ${f.metadata.product}` : null,
                f.metadata?.note ? `Note: ${f.metadata.note}` : null
              ].filter(Boolean).join('\n');

              const partVisible = (s: number, e: number) => {
                const fX = xScale(s) - scrollX, fW = xScale(e) - xScale(s);
                return fX <= viewportWidth && fX + fW >= 0;
              };
              // The name is painted once, on the first piece in view, so a long join
              // keeps its name on screen without repeating it at every segment.
              const renderPart = (s: number, e: number, keySuffix: string, strand?: 1 | -1, pointed = true, labelled = true) => {
                const fX = xScale(s) - scrollX, fW = xScale(e) - xScale(s);
                if (!partVisible(s, e)) return null;

                if (f.type === 'quantitative_data') return null; // Handled by QuantitativeTrack

                const fill = f.color || getFeatureColor(f.type, customColors);
                const partStrand = strand ?? getFeatureStrand(f);
                const barPath = annotationBarPath(fX, y, Math.max(1, fW), barHeight, partStrand, pointed);

                return (
                  <React.Fragment key={`${i}-${keySuffix}`}>
                    <path
                      data-annotation-part=""
                      data-x={fX}
                      data-width={Math.max(1, fW)}
                      d={barPath}
                      fill={fill} fillOpacity={isSelected ? 0.45 : 0.3}
                      strokeLinejoin="round"
                      stroke={isSelected ? '#000' : (isBroken ? '#ef4444' : fill)}
                      strokeWidth={isSelected ? 1.5 : 1}
                      strokeDasharray={isBroken && !isSelected ? '3,2' : undefined}
                      style={{ cursor: 'pointer' }} opacity={isSelected ? 1 : 0.85}
                      onMouseOver={(ev) => setTooltip({ x: ev.pageX, y: ev.pageY, content: tooltipContent() })}
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
                    <AnnotationText feature={f} sequence={seq} moleculeType={l.record.moleculeType}
                      start={s} end={e} strand={strand} y={y} height={barHeight} zoom={zoomLevel} expanded={expanded} labelled={labelled}
                      scrollX={scrollX} viewportWidth={viewportWidth} />
                  </React.Fragment>
                );
              };

              if (f.segments && f.segments.length > 0) {
                const lineY = y + ANNOT_BAR_HEIGHT / 2;
                
                // Draw connecting lines between segments
                const connectingLines: React.ReactElement[] = [];
                for (let idx = 0; idx < f.segments.length - 1; idx++) {
                  const s1 = f.segments[idx];
                  const s2 = f.segments[idx + 1];

                  // parseLocation sets a descending envelope only for a vetted origin
                  // wrap, and it cannot see the crossings its header calls "false
                  // linear", which reach the sequence end. Either says the FEATURE
                  // crosses; s1.end > s2.start picks the one PAIR that does.
                  if ((isWrap || s1.end >= lastBaseEnd) && s1.end > s2.start) {
                    const x1 = xScale(s1.end) - scrollX;
                    const xEnd = xScale(seq.length) - scrollX;
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
                
                const labelIdx = f.segments.findIndex(seg => partVisible(seg.start, seg.end));
                const marks = segmentFrameshifts(f).map(({ position, shift }) => {
                  const mx = xScale(position) - scrollX;
                  if (mx < -30 || mx > viewportWidth + 30) return null;
                  // A tick on the shared (or skipped) base and a badge naming the shift.
                  return (
                    <g key={`fs-${position}`} data-frameshift={shift} data-x={mx} pointerEvents="none">
                      <line x1={mx} x2={mx} y1={y - 2} y2={y + ANNOT_BAR_HEIGHT + 2} stroke="#0f172a" strokeWidth={1.5} />
                      <rect x={mx + 3} y={y + 2} width={18} height={ANNOT_BAR_HEIGHT - 4} rx={2} fill="#0f172a" />
                      <text x={mx + 12} y={y + ANNOT_BAR_HEIGHT / 2} fontSize={8} fontWeight={700} fill="#fff" textAnchor="middle" dominantBaseline="central">{frameshiftLabel(shift)}</text>
                    </g>
                  );
                });
                return place(
                  <>
                    {connectingLines}
                    {f.segments.map((seg: FeatureSegment, idx: number) => {
                      // Only the piece where the feature ends (its 3′ side) gets the arrow head.
                      const segStrand = seg.strand ?? getFeatureStrand(f);
                      const terminal = segStrand === -1
                        ? seg.start === Math.min(...f.segments!.map(x => x.start))
                        : seg.end === Math.max(...f.segments!.map(x => x.end));
                      return renderPart(seg.start, seg.end, `seg-${idx}`, seg.strand, terminal, idx === labelIdx);
                    })}
                    {marks}
                  </>
                );
              }

              if (isWrap) {
                return place(
                  <>
                    {renderPart(f.start, seq.length, 'p1', undefined, getFeatureStrand(f) === -1)}
                    {renderPart(0, f.end, 'p2', undefined, getFeatureStrand(f) !== -1, !partVisible(f.start, seq.length))}
                  </>
                );
              }
              return place(renderPart(f.start, f.end, 'p1'));
            })}

          </svg>
          {focusedRegion && focusLabelLeft !== null && (
            <div
              className="absolute z-30 ml-1 pointer-events-none whitespace-nowrap rounded-full bg-amber-500 px-2 text-[9px] font-bold leading-[14px] text-amber-950 shadow-sm animate-in fade-in duration-300 motion-reduce:animate-none"
              style={{ left: focusLabelLeft, top: 2 }}
            >
              {`${focusedRegion.label} · ${focusedRegion.length.toLocaleString()} bp`}
            </div>
          )}

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
                    className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border shadow-sm"
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
