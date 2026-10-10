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

import React from 'react';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { ANNOT_BAR_HEIGHT, ANNOT_BASES_HEIGHT, MONO_STACK } from './constants';
import { annotationBase, annotationDirection, fitAnnotationText } from './annotationPresentation';

/** Advance widths of the 10px name and 9px direction text in the mono stack. */
const NAME_CHAR = 6.0;
const DIR_CHAR = 5.4;
/** Room the arrow head takes at the bar's pointed end. */
const HEAD_ROOM = 8;

interface Props {
  feature: BioFeature;
  sequence: string;
  moleculeType?: SeqRecord['moleculeType'];
  start: number;
  end: number;
  strand?: 1 | -1;
  y: number;
  zoom: number;
  scrollX: number;
  viewportWidth: number;
  /** Height of the clipping svg, matching the bar it labels; defaults to the closed or fully open bar. */
  height?: number;
  /** The bar is open (opted in and zoomed in): draw the bases inside it, under the name. */
  expanded?: boolean;
  /** Only one piece of a multi-part feature carries the name and direction; the others draw bases alone. */
  labelled?: boolean;
}

/** The label inside a thin annotation bar: the name, then the direction when it
 * fits (full, then short, then dropped — the arrow already shows the strand).
 * An expanded bar also holds the bases on a second line, inside the shape; only
 * visible bases are visited, so zooming into a long feature stays cheap.
 */
export function AnnotationText({ feature, sequence, moleculeType, start, end, strand, y, height, zoom, scrollX, viewportWidth, expanded = false, labelled = true }: Props) {
  const clipHeight = height ?? ANNOT_BAR_HEIGHT + (expanded ? ANNOT_BASES_HEIGHT : 0);
  const left = Math.max(0, start * zoom - scrollX);
  const right = Math.min(viewportWidth, end * zoom - scrollX);
  const width = right - left;
  if (width <= 0) return null;
  const direction = strand ?? getFeatureStrand(feature);
  const fullDirection = annotationDirection(feature, moleculeType, strand);
  const shortDirection = moleculeType === 'protein' ? 'Protein'
    : direction === 1 ? '5′→3′' : direction === -1 ? '3′←5′' : direction === '.' ? 'Unstranded' : 'Unknown';
  const name = labelled ? fitAnnotationText(feature.name, width - HEAD_ROOM, NAME_CHAR) : '';
  const dirRoom = width - HEAD_ROOM - 4 - name.length * NAME_CHAR - 10;
  const directionText = !name ? ''
    : dirRoom >= fullDirection.length * DIR_CHAR ? fullDirection
    : dirRoom >= shortDirection.length * DIR_CHAR ? shortDirection : '';
  const midY = ANNOT_BAR_HEIGHT / 2;

  const bases: React.ReactElement[] = [];
  if (expanded) {
    const first = Math.max(start, 0, Math.floor((scrollX + left) / zoom));
    const last = Math.min(end, sequence.length, Math.ceil((scrollX + right) / zoom));
    for (let pos = first; pos < last; pos++) {
      bases.push(<text key={pos} data-annotation-base={pos} x={(pos + 0.5) * zoom - scrollX - left} y={ANNOT_BAR_HEIGHT + ANNOT_BASES_HEIGHT / 2 - 1} textAnchor="middle" dominantBaseline="central">
        {annotationBase(sequence[pos], direction, moleculeType)}
      </text>);
    }
  }
  return (
    <svg x={left} y={y} width={width} height={clipHeight} overflow="hidden" pointerEvents="none" aria-label={`${feature.name}: ${fullDirection}`}>
      <g fill="#0f172a" fontFamily={MONO_STACK} dominantBaseline="central">
        {name && <text data-annotation-name="" x={4} y={midY} fontSize={10} fontWeight={600}>{name}</text>}
        {directionText && (
          <text data-annotation-direction="" x={4 + name.length * NAME_CHAR + 10} y={midY} fontSize={9} fill="#475569">{directionText}</text>
        )}
        {expanded && <g className="annot-bases" fontSize={11} fontWeight={600}>{bases}</g>}
      </g>
    </svg>
  );
}
