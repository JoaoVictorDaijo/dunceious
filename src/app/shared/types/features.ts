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

import type { BioFeature } from '@/src/domain/bio/types';

export type FlatItem =
  | { type: 'header'; recordId: string; count: number }
  | { type: 'track'; recordId: string; track: any }
  | { type: 'feature'; recordId: string; feature: BioFeature & { index: number } };

export interface EditingFeatureState {
  recordId: string;
  /** -1 means "new feature" */
  featureIndex: number;
  feature: BioFeature;
}
