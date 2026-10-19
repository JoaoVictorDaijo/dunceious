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

export interface ViewerToolbarStep {
  id: 'full' | 'mini-min' | 'compare-compact' | 'icon-actions' | 'no-readout' | 'wrap';
  minimapMin: number;
  compareCompact: boolean;
  iconActions: boolean;
  readout: boolean;
  wrap: boolean;
}
const full: ViewerToolbarStep = { id: 'full', minimapMin: 160, compareCompact: false, iconActions: false, readout: true, wrap: false };
const mini: ViewerToolbarStep = { ...full, id: 'mini-min' };
const compact: ViewerToolbarStep = { ...mini, id: 'compare-compact', compareCompact: true };
const icons: ViewerToolbarStep = { ...compact, id: 'icon-actions', iconActions: true };
const noReadout: ViewerToolbarStep = { ...icons, id: 'no-readout', readout: false };
export const VIEWER_TOOLBAR_STEPS: readonly ViewerToolbarStep[] = [full, mini, compact, icons, noReadout, { ...noReadout, id: 'wrap', wrap: true }];
export interface ViewerToolbarMeasurements {
  available: number;
  minimapPreferred: number;
  gap: number;
  controls: { full: number; compareCompact: number; iconActions: number; noReadout: number };
}
export function chooseViewerToolbarStep(m: ViewerToolbarMeasurements): ViewerToolbarStep {
  const widths = [m.controls.full, m.controls.full, m.controls.compareCompact, m.controls.iconActions, m.controls.noReadout];
  return VIEWER_TOOLBAR_STEPS.find((step, index) => step.wrap ||
    widths[index] + (index === 0 ? m.minimapPreferred : step.minimapMin) + m.gap <= m.available)!;
}
