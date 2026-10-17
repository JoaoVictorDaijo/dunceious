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

import { describe, expect, it } from 'vitest';
import { chooseTopBarStep, TOP_BAR_STEPS, type TopBarMeasurements } from '../topBarFit';

const measured: TopBarMeasurements = {
  barWidth: 1920, paddingX: 24, brandWidth: { withSlogan: 345, withoutSlogan: 221 },
  switcherWidth: { full: 344, short: 250, icon: 100 }, toolsGap: 16,
  toolsWidth: { 'layers-full': 557, 'layers-tight': 540, 'layers-short': 470, 'layers-menu': 270 },
};
const at = (barWidth: number) => ({ ...measured, barWidth });

describe('chooseTopBarStep', () => {
  it('chooses centred at 1920', () => {
    const fit = chooseTopBarStep(measured, 'viewport');
    expect(fit.step.id).toBe('centred');
    expect(fit.switcherLeft).toBe(788);
    expect(fit.fits).toBe(true);
  });
  it('slides left before giving anything up', () => {
    const fit = chooseTopBarStep(at(1440), 'viewport');
    expect(fit.step.id).toBe('slide');
    expect(fit.switcherLeft).toBeLessThan(548);
    expect(fit.switcherLeft).toBeGreaterThanOrEqual(433);
  });
  it('keeps the order as the bar shrinks', () => {
    let previous = -1;
    for (let width = 1920; width >= 680; width -= 2) {
      const fit = chooseTopBarStep(at(width), 'viewport');
      const index = TOP_BAR_STEPS.findIndex(step => step.id === fit.step.id);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });
  it('is stateless', () => {
    const alone = chooseTopBarStep(at(1300), 'viewport');
    chooseTopBarStep(at(900), 'viewport');
    expect(chooseTopBarStep(at(1300), 'viewport')).toEqual(alone);
    expect(chooseTopBarStep(at(1300), 'viewport')).toEqual(alone);
  });
  it('may sit right of centre when the brand reaches past it', () => {
    const fit = chooseTopBarStep({ ...at(1200), brandWidth: { withSlogan: 700, withoutSlogan: 700 } }, 'viewport');
    expect(fit.switcherLeft).toBe(24 + 700 + fit.step.logoGap);
  });
  it('hub skips layer steps and uses hub variants', () => {
    const hub = { ...measured, toolsWidth: { 'hub-full': 2000, 'hub-icon': 1900, 'hub-narrow': 200 } };
    expect(chooseTopBarStep(hub, 'hub').step.id).toBe('hub-narrow-search');
    for (let width = 1920; width >= 680; width -= 2) {
      expect(['tight-layers', 'short-layers', 'layers-menu']).not.toContain(chooseTopBarStep({ ...hub, barWidth: width }, 'hub').step.id);
    }
  });
  it.each(['viewport', 'hub'] as const)('reports fits false on the last %s step', mode => {
    const fit = chooseTopBarStep({ ...at(300), toolsWidth: { ...measured.toolsWidth, 'hub-full': 500, 'hub-icon': 400, 'hub-narrow': 300 } }, mode);
    expect(fit.fits).toBe(false);
    expect(fit.step.id).toBe(mode === 'viewport' ? 'icon-modes' : 'hub-narrow-search');
  });
});
