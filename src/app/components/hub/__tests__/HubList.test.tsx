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
import { render, screen, fireEvent, within, stubResizeObserver, renderHook, act } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
import type { SeqRecord } from '@/src/domain/bio/types';
import HubList from '../HubList';
import { useAppLogger } from '@/src/app/hooks/useAppLogger';
const records: SeqRecord[] = ['one', 'two', 'three'].map(id => ({ id, name: id, sequence: 'A'.repeat(100), features: [{ type: 'CDS', name: `${id}-gene`, start: 5, end: 25, strand: -1 }] }));
function Subject({ kind = 'sequences', offset = 0 }: { kind?: 'sequences' | 'features'; offset?: number }) {
  const state = useHubState();
  useLayoutEffect(() => { state.setTab(kind); state.setScrollOffset({ sequences: offset, features: offset }); }, [kind, offset]);
  const sections = buildSequenceSections(records, state.filters, { grouped: false }, 'load');
  return <><button onClick={() => state.setDensity('comfortable')}>Comfortable</button><button onClick={() => state.setJumpTarget({ key: 'three:0', serial: 1 })}>Jump third</button><HubList state={state} kind={kind} items={kind === 'sequences' ? sections : buildFeatureGroups(records, state.filters, false)} height={180} /></>;
}
describe('HubList', () => {
  it.each(['compact', 'comfortable'])('uses the rendered content height for %s sequence headers', density => {
    render(<Subject />);
    if (density === 'comfortable') fireEvent.click(screen.getByText('Comfortable'));
    const pinned = screen.getByRole('region', { name: 'Pinned section' });
    const header = pinned.firstElementChild as HTMLElement;
    const row = screen.getByText('one-gene').closest('[data-row-key]')!.parentElement!;
    expect(pinned.style.height).toBe('122px');
    expect(header.style.height).toBe('122px');
    expect(row.style.top).toBe('122px');
    expect(row.style.height).toBe(density === 'comfortable' ? '64px' : '44px');
    fireEvent.click(within(pinned).getByRole('button', { name: 'Collapse one' }));
    expect(pinned.style.height).toBe('81px');
    expect((pinned.firstElementChild as HTMLElement).style.height).toBe('81px');
  });

  it('pins the section at the restored offset and recomputes after density and jumps', () => {
    stubResizeObserver(); render(<Subject offset={190} />);
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('two')).toBeTruthy();
    fireEvent.click(screen.getByText('Comfortable'));
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('two')).toBeTruthy();
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
    expect(Number.parseFloat(row?.style.top ?? '0') - (viewport?.scrollTop ?? 0)).toBeGreaterThanOrEqual(122);
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


it('keeps the logging callback stable when a log entry changes', () => {
  const { result } = renderHook(useAppLogger);
  const first = result.current.addLog;
  act(() => result.current.addLog('new entry'));
  expect(result.current.addLog).toBe(first);
  expect(result.current.logs[0]).toContain('new entry');
});

it('clears unresolvable jumps before a later filter change can replay them', () => {
  function Pending() {
    const state = useHubState();
    return <><button onClick={() => state.setJumpTarget({ key: 'three:0', serial: 1 })}>Hidden jump</button><output aria-label="Pending jump">{state.jumpTarget?.key ?? 'none'}</output><HubList state={state} kind="sequences" items={buildSequenceSections(records.slice(0, 1), state.filters, { grouped: false }, 'load')} height={180} /></>;
  }
  render(<Pending />); fireEvent.click(screen.getByText('Hidden jump'));
  expect(screen.getByLabelText('Pending jump').textContent).toBe('none');
});

it('keeps other sequence strips bright when one annotation is hovered', () => {
  render(<Subject />);
  fireEvent.mouseEnter(screen.getByText('one-gene').closest('[data-row-key]')!);
  const other = screen.getByRole('button', { name: /Genome strip for two/ });
  expect([...other.querySelectorAll('path')].every(path => path.getAttribute('opacity') === '1')).toBe(true);
});

it('updates the pinned track window from visible rows and hides it after folding', () => {
  render(<Subject />);
  const pinned = screen.getByRole('region', { name: 'Pinned section' });
  const band = pinned.querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.hidden).toBe(false);
  expect(band.style.left).toBe('5%'); expect(band.style.width).toBe('20%');
  expect(pinned.querySelector('[data-track-window-label]')?.textContent).toBe('6–25 in view');
  expect(pinned.firstElementChild?.className).toContain('bg-amber-50/95');
  fireEvent.click(within(pinned).getByRole('button', { name: 'Collapse one' }));
  expect(pinned.querySelector('[data-track-window]')).toBeNull();
});

it('extends an origin-crossing visible feature window to the sequence end', () => {
  const crossing = { ...records[0], isCircular: true, features: [{ name: 'wrap', type: 'gene', start: 90, end: 10, strand: 1 as const }] };
  function Wrap() { const state = useHubState(); return <HubList state={state} kind="sequences" height={300} items={buildSequenceSections([crossing], state.filters, { grouped: false }, 'load')} />; }
  render(<Wrap />);
  const band = screen.getByRole('region', { name: 'Pinned section' }).querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.style.left).toBe('90%'); expect(band.style.width).toBe('10%');
});

it('spans the minimum start and maximum end when visible rows stay in file order', () => {
  const unordered = { ...records[0], features: [
    { name: 'late', type: 'gene', start: 60, end: 90, strand: 1 as const },
    { name: 'early', type: 'gene', start: 10, end: 30, strand: 1 as const },
  ] };
  function Wrap() { const state = useHubState(); return <HubList state={state} kind="sequences" height={400} items={buildSequenceSections([unordered], state.filters, { grouped: false }, 'load')} />; }
  render(<Wrap />);
  const band = screen.getByRole('region', { name: 'Pinned section' }).querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.style.left).toBe('10%'); expect(band.style.width).toBe('80%');
});
