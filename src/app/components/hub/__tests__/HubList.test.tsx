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
import { useLayoutEffect } from 'react';
import { render, screen, fireEvent, within, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
import type { SeqRecord } from '@/src/domain/bio/types';
import HubList from '../HubList';
const records: SeqRecord[] = ['one', 'two', 'three'].map(id => ({ id, name: id, sequence: 'A'.repeat(100), features: [{ type: 'CDS', name: `${id}-gene`, start: 5, end: 25, strand: -1 }] }));
function Subject({ kind = 'sequences', offset = 0 }: { kind?: 'sequences' | 'features'; offset?: number }) {
  const state = useHubState();
  useLayoutEffect(() => { state.setTab(kind); state.setScrollOffset({ sequences: offset, features: offset }); }, [kind, offset]);
  const sections = buildSequenceSections(records, state.filters, { grouped: false }, 'load');
  return <><button onClick={() => state.setDensity('comfortable')}>Comfortable</button><button onClick={() => state.setJumpTarget({ key: 'three:0', serial: 1 })}>Jump third</button><HubList state={state} kind={kind} items={kind === 'sequences' ? sections : buildFeatureGroups(records, state.filters, false)} height={180} /></>;
}
describe('HubList', () => {
  it('pins the section at the restored offset and recomputes after density and jumps', () => {
    stubResizeObserver(); render(<Subject offset={190} />);
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('two')).toBeTruthy();
    fireEvent.click(screen.getByText('Comfortable'));
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('one')).toBeTruthy();
    fireEvent.click(screen.getByText('Jump third'));
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('three')).toBeTruthy();
  });
  it('updates the pinned header after a scroll event', () => {
    render(<Subject />);
    const viewport = screen.getByText('one-gene').closest('[data-row-key]')?.parentElement?.parentElement?.parentElement;
    if (!viewport) throw new Error('Virtual viewport missing');
    Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 180 }, scrollHeight: { configurable: true, value: 532 } });
    fireEvent.scroll(viewport, { target: { scrollTop: 190 } });
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('two')).toBeTruthy();
  });
  it('can pin the final short section and leaves its target row below the header', () => {
    render(<Subject />); fireEvent.click(screen.getByText('Jump third'));
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('three')).toBeTruthy();
    const row = screen.getByText('three-gene').closest('[data-row-key]')?.parentElement;
    const viewport = row?.parentElement?.parentElement;
    expect(Number.parseFloat(row?.style.top ?? '0') - (viewport?.scrollTop ?? 0)).toBeGreaterThanOrEqual(132);
  });
  it('folds rows and shows the composition summary', () => {
    render(<Subject />); fireEvent.click(within(screen.getByRole('region', { name: 'Pinned section' })).getByRole('button', { name: 'Collapse one' }));
    expect(screen.queryByText('one-gene')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('1 CDS')).toBeTruthy();
  });
  it('uses the reverse strand for both glyph and colour', () => {
    render(<Subject />); const arrow = screen.getAllByLabelText('Reverse strand')[0];
    expect(arrow.textContent).toBe('←'); expect(arrow.className).toContain('text-rose-');
  });
  it('shows an unknown-organism comparison without missing tags and with a cell per pool record', () => {
    render(<Subject kind="features" />);
    const pinned = within(screen.getByRole('region', { name: 'Pinned section' }));
    expect(pinned.getByText('not compared: organism unknown')).toBeTruthy();
    expect(pinned.queryByText(/missing in/)).toBeNull();
    const cells = within(pinned.getByRole('group', { name: 'Presence' })).getAllByRole('button');
    expect(cells).toHaveLength(3); expect(cells.map(c => c.className)).toEqual([expect.stringContaining('state-present'), expect.stringContaining('state-absent'), expect.stringContaining('state-absent')]);
  });
});
