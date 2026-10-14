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

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import FilterBar from '../FilterBar';
function Subject() {
  const state = useHubState();
  return <><FilterBar state={state} types={new Map([['CDS', 2]])} keys={['one']} featureColors={{ CDS: 'purple' }} /><output aria-label="Filter state">{state.filters.strand} {state.density} {state.filters.types.size}</output></>;
}
describe('filter segments', () => {
  it('sets the same strand and density states through labelled buttons', () => {
    render(<Subject />);
    const strand = screen.getByRole('group', { name: 'Strand' });
    fireEvent.click(within(strand).getByRole('button', { name: 'Reverse strand only' }));
    expect(screen.getByLabelText('Filter state').textContent).toBe('rev compact 0');
    fireEvent.click(within(screen.getByRole('group', { name: 'Density' })).getByRole('button', { name: 'Comfortable' }));
    expect(screen.getByLabelText('Filter state').textContent).toBe('rev comfortable 0');
    fireEvent.click(within(strand).getByRole('button', { name: 'Forward strand only' }));
    fireEvent.click(within(strand).getByRole('button', { name: 'All strands' }));
    expect(screen.getByLabelText('Filter state').textContent).toBe('all comfortable 0');
  });
  it('uses the configured swatch and keeps type selection semantics', () => {
    render(<Subject />);
    const chip = screen.getByRole('button', { name: 'CDS 2' });
    expect(chip.querySelector<HTMLElement>('[data-type-swatch]')?.style.backgroundColor).toBe('purple');
    fireEvent.click(chip); expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Filter state').textContent).toBe('all compact 1');
    fireEvent.click(chip); expect(chip.getAttribute('aria-pressed')).toBe('false');
  });
});


it('keeps fold-all names and tooltips with stacked-box SVG icons', () => {
  render(<Subject />);
  for (const name of ['Expand all', 'Collapse all']) {
    const button = screen.getByRole('button', { name });
    expect(button.getAttribute('data-tip')).toBe(name);
    const icon = button.querySelector('svg')!;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute('width')).toBe('16');
    expect(icon.getAttribute('stroke')).toBe('currentColor');
    expect(icon.getAttribute('stroke-width')).toBe('1.5');
    expect(icon.querySelectorAll('rect')).toHaveLength(2);
    expect(icon.querySelector('[data-plus]') !== null).toBe(name === 'Expand all');
  }
});


it('keeps controls together beside a wrapping type zone on both tabs', () => {
  function Filters() {
    const state = useHubState();
    return <><button onClick={() => state.setTab('features')}>Features</button><FilterBar state={state} types={new Map(Array.from({ length: 20 }, (_, i) => [`type${i}`, 1]))} keys={['one']} /></>;
  }
  render(<Filters />);
  for (const features of [false, true]) {
    if (features) fireEvent.click(screen.getByText('Features'));
    const controls = screen.getByRole('group', { name: 'Strand' }).parentElement!;
    expect(controls.className).toContain('flex-none');
    expect(controls.className).toContain('flex-nowrap');
    expect(controls.className).toContain('items-start');
    expect(controls.className).toContain('justify-end');
    expect(within(controls).getByRole('group', { name: 'Density' })).toBeTruthy();
    expect(within(controls).getByRole('button', { name: 'Expand all' })).toBeTruthy();
    expect(within(controls).getByRole('button', { name: 'Collapse all' })).toBeTruthy();
    if (features) expect(within(controls).getByRole('button', { name: 'Only missing or odd length' })).toBeTruthy();
    const types = screen.getByRole('button', { name: 'type0 1' }).parentElement!;
    expect(types).not.toBe(controls);
    expect(types.parentElement).toBe(controls.parentElement);
    expect(types.className).toContain('flex-wrap');
    expect(types.className).toContain('min-w-0');
    expect(types.className).toContain('flex-1');
    expect(controls.parentElement!.classList.contains('flex-wrap')).toBe(false);
  }
});
