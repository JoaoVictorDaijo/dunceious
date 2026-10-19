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

import { expect, it } from 'vitest';
import { chooseViewerToolbarStep } from '../viewerToolbarFit';

const measured = { available: 900, minimapPreferred: 300, gap: 8,
  controls: { full: 500, compareCompact: 450, iconActions: 350, noReadout: 250 } };

it.each([
  [808, 'full'], [807, 'mini-min'], [668, 'mini-min'], [667, 'compare-compact'],
  [618, 'compare-compact'], [617, 'icon-actions'], [518, 'icon-actions'],
  [517, 'no-readout'], [418, 'no-readout'], [417, 'wrap'],
])('at %i chooses %s', (available, id) => {
  expect(chooseViewerToolbarStep({ ...measured, available }).id).toBe(id);
});
