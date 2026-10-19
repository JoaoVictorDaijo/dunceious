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

export type ModeLabels = 'full' | 'short' | 'icon';
export type LayerForm = 'full' | 'tight' | 'short' | 'menu';
export type HubForm = 'full' | 'icon' | 'narrow';
export type ToolsVariant = `layers-${LayerForm}` | `hub-${HubForm}`;
export interface TopBarStep {
  id: 'centred' | 'slide' | 'gap-min' | 'no-slogan' | 'tight-layers' | 'short-modes'
    | 'short-layers' | 'layers-menu' | 'icon-modes' | 'hub-icon-tools' | 'hub-narrow-search' | 'no-wordmark';
  logoGap: number;
  slogan: boolean;
  modeLabels: ModeLabels;
  layers: LayerForm;
  hub: HubForm;
  allowSlide: boolean;
}

const centred: TopBarStep = { id: 'centred', logoGap: 64, slogan: true, modeLabels: 'full', layers: 'full', hub: 'full', allowSlide: false };
const slide: TopBarStep = { ...centred, id: 'slide', allowSlide: true };
const gapMin: TopBarStep = { ...slide, id: 'gap-min', logoGap: 32 };
const noSlogan: TopBarStep = { ...gapMin, id: 'no-slogan', slogan: false };
const tightLayers: TopBarStep = { ...noSlogan, id: 'tight-layers', logoGap: 20, layers: 'tight' };
const shortModes: TopBarStep = { ...tightLayers, id: 'short-modes', modeLabels: 'short' };
const shortLayers: TopBarStep = { ...shortModes, id: 'short-layers', layers: 'short' };
const layersMenu: TopBarStep = { ...shortLayers, id: 'layers-menu', layers: 'menu' };
const iconModes: TopBarStep = { ...layersMenu, id: 'icon-modes', logoGap: 16, modeLabels: 'icon' };
const hubIcon: TopBarStep = { ...iconModes, id: 'hub-icon-tools', hub: 'icon' };
const hubNarrow: TopBarStep = { ...hubIcon, id: 'hub-narrow-search', hub: 'narrow' };
export const TOP_BAR_STEPS: readonly TopBarStep[] = [centred, slide, gapMin, noSlogan, tightLayers, shortModes, shortLayers, layersMenu, iconModes, hubIcon, hubNarrow, { ...hubNarrow, id: 'no-wordmark' }];

export interface TopBarMeasurements {
  barWidth: number;
  paddingX: number;
  brandWidth: { withSlogan: number; withoutSlogan: number; toggleOnly: number };
  switcherWidth: Record<ModeLabels, number>;
  toolsGap: number;
  toolsWidth: Partial<Record<ToolsVariant, number>>;
}
export interface TopBarFit { step: TopBarStep; switcherLeft: number; fits: boolean }

export function chooseTopBarStep(m: TopBarMeasurements, mode: 'viewport' | 'hub'): TopBarFit {
  const steps = TOP_BAR_STEPS.filter(step => mode === 'viewport'
    ? !step.id.startsWith('hub-')
    : !['tight-layers', 'short-layers', 'layers-menu'].includes(step.id));
  let result: TopBarFit;
  for (const step of steps) {
    const switcherWidth = m.switcherWidth[step.modeLabels];
    const variant: ToolsVariant = mode === 'viewport' ? `layers-${step.layers}` : `hub-${step.hub}`;
    const toolsWidth = m.toolsWidth[variant] ?? Infinity;
    const preferredLeft = (m.barWidth - switcherWidth) / 2;
    const minLeft = m.paddingX + m.brandWidth[step.id === 'no-wordmark' ? 'toggleOnly' : step.slogan ? 'withSlogan' : 'withoutSlogan'] + step.logoGap;
    const maxLeft = m.barWidth - m.paddingX - toolsWidth - m.toolsGap - switcherWidth;
    const fits = minLeft <= maxLeft && (step.allowSlide || (minLeft <= preferredLeft && preferredLeft <= maxLeft));
    result = { step, switcherLeft: Math.max(minLeft, Math.min(preferredLeft, maxLeft)), fits };
    if (fits) return result;
  }
  return result!;
}
