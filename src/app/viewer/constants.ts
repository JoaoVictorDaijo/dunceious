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

/** Matches Tailwind's `font-mono`; SVG and canvas text cannot read the CSS theme. */
export const MONO_STACK = '"JetBrains Mono Variable", ui-monospace, monospace';

export const SIDEBAR_WIDTH = 120;
export const NT_ROW_HEIGHT = 22;
export const AA_ROW_HEIGHT = 18;
export const TRANSLATION_MIN_ZOOM = 5;
/** Annotation bar height: a thin Geneious-style arrow, so dense records stay readable. */
export const ANNOT_BAR_HEIGHT = 14;
/** Extra lane height for an annotation whose bases are switched on (drawn under the bar). */
export const ANNOT_BASES_HEIGHT = 14;
/** Vertical gap between annotation lanes. */
export const ANNOT_LANE_GAP = 4;
/** Zoom (px per base) above which an opted-in annotation opens to show its bases. */
export const ANNOT_BASES_MIN_ZOOM = 12;
export const RULER_HEIGHT = 25;
