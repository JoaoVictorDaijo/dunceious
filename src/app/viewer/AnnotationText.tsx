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

import React from 'react';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { ANNOT_ROW_HEIGHT } from './constants';
import { annotationBase, annotationDirection, fitAnnotationText } from './annotationPresentation';

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
}

/** Text stays inside the visible feature part. Only visible bases are visited,
 * so zooming into a long feature does not allocate its full sequence in the DOM.
 */
export function AnnotationText({ feature, sequence, moleculeType, start, end, strand, y, zoom, scrollX, viewportWidth }: Props) {
  const left = Math.max(0, start * zoom - scrollX);
  const right = Math.min(viewportWidth, end * zoom - scrollX);
  const width = right - left;
  if (width <= 0) return null;
  const direction = strand ?? getFeatureStrand(feature);
  const fullDirection = annotationDirection(feature, moleculeType, strand);
  const directionText = width >= 150 ? fullDirection : moleculeType === 'protein' ? 'Protein'
    : direction === 1 ? '5′ → 3′' : direction === -1 ? '3′ ← 5′' : direction === '.' ? 'Unstranded' : 'Unknown';
  const first = Math.max(start, 0, Math.floor((scrollX + left) / zoom));
  const last = Math.min(end, sequence.length, Math.ceil((scrollX + right) / zoom));
  const bases: React.ReactElement[] = [];
  if (zoom > 12) {
    for (let pos = first; pos < last; pos++) {
      bases.push(<text key={pos} data-annotation-base={pos} x={(pos + 0.5) * zoom - scrollX - left} y={37} textAnchor="middle">
        {annotationBase(sequence[pos], direction, moleculeType)}
      </text>);
    }
  }
  return (
    <svg x={left} y={y} width={width} height={ANNOT_ROW_HEIGHT} overflow="hidden" pointerEvents="none" aria-label={`${feature.name}: ${fullDirection}; annotated region bases`}>
      <g fill="#0f172a" fontFamily="monospace" fontSize={11}>
        <text data-annotation-name="" x={4} y={12} fontWeight="bold">{fitAnnotationText(feature.name, width, 6.7)}</text>
        <text data-annotation-direction="" x={4} y={24} fontSize={9}>{fitAnnotationText(directionText, width, 5.5)}</text>
        <g fontWeight="bold">{bases}</g>
      </g>
    </svg>
  );
}
