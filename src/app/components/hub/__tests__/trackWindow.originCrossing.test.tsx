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
import { expect, it } from 'vitest';
import { render, screen, fireEvent, act } from '@/src/app/testing/renderHarness';
import { createOriginCrossingRecord } from '@/src/app/testing/fixtures/originCrossing';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import GenomeStrip from '../GenomeStrip';
import HubList from '../HubList';
import HubIndex from '../HubIndex';
import { createTrackWindow } from '../trackWindow';

it.each(['polymerase', 'envelope'])('encloses both ends when the only visible row is %s', query => {
  const record = createOriginCrossingRecord();
  function Subject() {
    const state = useHubState();
    const filters = { ...state.filters, query };
    const items = buildSequenceSections([record], filters, { grouped: false }, 'load');
    return <><HubIndex records={[record]} state={state} /><HubList items={items} kind="sequences" state={state} height={500} /></>;
  }
  const { container } = render(<Subject />);
  expect(screen.getByLabelText(`Select annotation ${query} on J02442`)).toBeTruthy();
  const bands = [...container.querySelectorAll<HTMLElement>('[data-track-window]')];
  expect(bands.length).toBeGreaterThanOrEqual(2);
  for (const band of bands) {
    expect(band.hidden).toBe(false);
    expect(band.style.left).toBe('0%');
    expect(band.style.width).toBe('100%');
  }
  const label = container.querySelector('[data-track-window-label]')!;
  expect(label.textContent).toBe('1–3,308 in view');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse J02442' }));
  expect(bands.every(band => band.hidden)).toBe(true);
});

it('paints one enclosing interval in all registered strips and hides other records', () => {
  const record = createOriginCrossingRecord();
  const other = { ...record, id: 'other' };
  const trackWindow = createTrackWindow();
  const { container } = render(<><GenomeStrip record={record} large trackWindow={trackWindow} />
    <GenomeStrip record={record} trackWindow={trackWindow} /><GenomeStrip record={other} trackWindow={trackWindow} /></>);
  act(() => trackWindow.update({ id: 'J02442', length: 3308, start: 0, end: 3308 }));
  const bands = [...container.querySelectorAll<HTMLElement>('[data-track-window]')];
  expect(bands.map(band => band.hidden)).toEqual([false, false, true]);
  expect(bands.slice(0, 2).map(band => [band.style.left, band.style.width])).toEqual([['0%', '100%'], ['0%', '100%']]);
  expect(container.querySelector('[data-track-window-label]')!.textContent).toBe('1–3,308 in view');
  act(() => trackWindow.update(null));
  expect(bands.every(band => band.hidden)).toBe(true);
});
