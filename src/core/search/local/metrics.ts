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

import type { LocalHitMetrics } from '@/src/domain/bio/types';
import type { HitColumn } from '../hitColumns';
import type { LocalAlignment } from './engine';
import { scoreOf, type LocalScoring } from './scoring';

/** EMBOSS ajalign.c definitions: all alignment columns, including gaps, form the denominator. */
export function localMetrics(columns: HitColumn[], alignment: LocalAlignment,
  scoring: LocalScoring, queryLength: number): LocalHitMetrics {
  let identical = 0, similar = 0, gaps = 0;
  for (const { queryBase, recordBase } of columns) {
    if (queryBase === null || recordBase === null) gaps++;
    else {
      if (queryBase.toUpperCase() === recordBase.toUpperCase()) identical++;
      if (scoreOf(scoring, queryBase, recordBase) > 0) similar++;
    }
  }
  return { score: alignment.score2 / 2, length: columns.length, identical, similar, gaps,
    queryStart: alignment.queryStart, queryEnd: alignment.queryEnd, queryLength };
}
