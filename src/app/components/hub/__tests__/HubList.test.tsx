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
import { describe, it, expect, vi } from 'vitest';
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
function currentCard(): HTMLElement {
  return document.querySelector<HTMLElement>('.hub-group-current')!;
}
describe('HubList', () => {
  it.each(['compact', 'comfortable'])('uses the rendered content height for %s sequence headers', density => {
    render(<Subject />);
    if (density === 'comfortable') fireEvent.click(screen.getByText('Comfortable'));
    const pinned = currentCard();
    const header = pinned.firstElementChild as HTMLElement;
    const row = screen.getByText('one-gene').closest('[data-row-key]')!.parentElement!;
    expect(pinned.style.height).toBe(density === 'comfortable' ? '193px' : '173px');
    expect(header.style.height).toBe('141px');
    expect(row.style.top).toBe('129px');
    expect(row.style.height).toBe(density === 'comfortable' ? '64px' : '44px');
    fireEvent.click(within(pinned).getByRole('button', { name: 'Collapse one' }));
    expect(pinned.style.height).toBe('84px');
    expect((pinned.firstElementChild as HTMLElement).style.height).toBe('96px');
  });

  it('pins the section at the restored offset and recomputes after density and jumps', () => {
    stubResizeObserver(); render(<Subject offset={210} />);
    expect(within(currentCard()).getByText('two')).toBeTruthy();
    fireEvent.click(screen.getByText('Comfortable'));
    expect(within(currentCard()).getByText('two')).toBeTruthy();
    fireEvent.click(screen.getByText('Jump third'));
    expect(within(currentCard()).getByText('three')).toBeTruthy();
  });
  it('updates the pinned header after a scroll event', () => {
    render(<Subject />);
    const viewport = screen.getByText('one-gene').closest('[data-row-key]')?.closest('.scrollbar-on-light');
    if (!viewport) throw new Error('Virtual viewport missing');
    Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 180 }, scrollHeight: { configurable: true, value: 532 } });
    fireEvent.scroll(viewport, { target: { scrollTop: 190 } });
    expect(within(currentCard()).getByText('two')).toBeTruthy();
  });
  it('can pin the final short section and leaves its target row below the header', () => {
    render(<Subject />); fireEvent.click(screen.getByText('Jump third'));
    expect(within(currentCard()).getByText('three')).toBeTruthy();
    const row = screen.getByText('three-gene').closest('[data-row-key]')?.parentElement as HTMLElement;
    const viewport = row?.closest('.scrollbar-on-light');
    expect(Number.parseFloat(row?.style.top ?? '0') + Number.parseFloat((row?.parentElement as HTMLElement)?.style.top ?? '0') - (viewport?.scrollTop ?? 0)).toBeGreaterThanOrEqual(122);
  });
  it('folds rows and shows the composition summary', () => {
    render(<Subject />);
    const first = currentCard();
    fireEvent.click(within(first).getByRole('button', { name: 'Collapse one' }));
    expect(screen.queryByText('one-gene')).toBeNull();
    expect(within(first).getByText('1 CDS')).toBeTruthy();
  });
  it('uses the reverse strand for both glyph and colour', () => {
    render(<Subject />); const arrow = screen.getAllByLabelText('Reverse strand')[0];
    expect(arrow.textContent).toBe('←'); expect(arrow.className).toContain('text-rose-');
  });
  it('shows an unknown-organism comparison without missing tags and with a cell per pool record', () => {
    render(<Subject kind="features" />);
    const pinned = within(currentCard());
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

it('updates the full track window from visible rows and hides it after folding', () => {
  render(<Subject />);
  const pinned = currentCard();
  const band = pinned.querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.hidden).toBe(false);
  expect(band.style.left).toBe('5%'); expect(band.style.width).toBe('20%');
  expect(pinned.querySelector('[data-track-window-label]')?.textContent).toBe('6–25 in view');
  expect(pinned.querySelector('[data-section-surface]')?.classList.contains('bg-amber-50')).toBe(true);
  expect(pinned.querySelector('[data-section-surface]')?.className).not.toContain('bg-amber-50/');
  fireEvent.click(within(pinned).getByRole('button', { name: 'Collapse one' }));
  expect(pinned.querySelector('[data-track-window]')).toBeNull();
});

it('extends an origin-crossing visible feature window to the sequence end', () => {
  const crossing = { ...records[0], isCircular: true, features: [{ name: 'wrap', type: 'gene', start: 90, end: 10, strand: 1 as const }] };
  function Wrap() { const state = useHubState(); return <HubList state={state} kind="sequences" height={300} items={buildSequenceSections([crossing], state.filters, { grouped: false }, 'load')} />; }
  render(<Wrap />);
  const band = currentCard().querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.style.left).toBe('90%'); expect(band.style.width).toBe('10%');
});

it('spans the minimum start and maximum end when visible rows stay in file order', () => {
  const unordered = { ...records[0], features: [
    { name: 'late', type: 'gene', start: 60, end: 90, strand: 1 as const },
    { name: 'early', type: 'gene', start: 10, end: 30, strand: 1 as const },
  ] };
  function Wrap() { const state = useHubState(); return <HubList state={state} kind="sequences" height={400} items={buildSequenceSections([unordered], state.filters, { grouped: false }, 'load')} />; }
  render(<Wrap />);
  const band = currentCard().querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.style.left).toBe('10%'); expect(band.style.width).toBe('80%');
});



it('keeps list position when empty track space is clicked or Shift arrows are pressed', () => {
  const sequence = { ...records[0], features: [10, 30, 60].map(start => ({ name: `row-${start}`, type: 'gene', start, end: start + 5, strand: 1 as const })) };
  function Indicator() {
    const state = useHubState();
    return <HubList state={state} kind="sequences" height={160} items={buildSequenceSections([sequence], state.filters, { grouped: false }, 'load')} />;
  }
  const { container } = render(<Indicator />);
  const strip = within(currentCard()).getByRole('button', { name: /Genome strip/ });
  vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 29 } as DOMRect);
  const viewport = container.querySelector<HTMLElement>('.custom-scrollbar-pro.scrollbar-on-light')!;
  fireEvent.pointerDown(strip, { clientX: 900, clientY: 2, button: 0, pointerId: 1 });
  fireEvent.pointerMove(strip, { clientX: 1000, clientY: 2, pointerId: 1 });
  fireEvent.pointerUp(strip, { pointerId: 1 });
  fireEvent.click(strip, { clientX: 900, clientY: 2 });
  fireEvent.keyDown(strip, { key: 'ArrowRight', shiftKey: true });
  expect(viewport.scrollTop).toBe(0);
});

it('separates cards by a twelve-pixel gap and marks the current rail block', () => {
  const values = [{ ...records[0], accession: 'NC_045512', label: 'Wuhan-Hu-1' }, records[1]];
  function Sections() { const state = useHubState(); return <HubList state={state} kind="sequences" height={400} items={buildSequenceSections(values, state.filters, { grouped: false }, 'load')} />; }
  render(<Sections />);
  const rail = within(screen.getByLabelText('Overview rail'));
  const current = rail.getByRole('button', { name: 'Jump to one' });
  expect(current.getAttribute('data-tip')).toBe('NC_045512 · Wuhan-Hu-1');
  expect(current.getAttribute('aria-current')).toBe('true');
  expect(current.className).toContain('bg-env');
  fireEvent.click(rail.getByRole('button', { name: 'Jump to two' }));
  expect(rail.getByRole('button', { name: 'Jump to two' }).getAttribute('aria-current')).toBe('true');
  const pinned = currentCard();
  expect(pinned.style.top).toBe('197px');
  expect(pinned.querySelector<HTMLElement>('[data-section-gap]')!.style.height).toBe('14px');
});



it.each([
  { label: 'Display name', definition: 'Definition', isolate: 'Isolate', want: 'Display name' },
  { label: '', definition: 'Definition', isolate: 'Isolate', want: 'Isolate' },
  { label: '', definition: 'Definition', isolate: '', want: 'Definition' },
  { label: '', definition: '', isolate: '', want: '' },
])('uses the export tree name fallback for rail tooltips: $want', ({ label, definition, isolate, want }) => {
  const values = [{ ...records[0], accession: 'NC_045512', label, definition, features: [...records[0].features, { type: 'source', name: 'source', start: 0, end: 100, strand: 1 as const, metadata: { isolate } }] }];
  function Sections() { const state = useHubState(); return <HubList state={state} kind="sequences" height={400} items={buildSequenceSections(values, state.filters, { grouped: false }, 'load')} />; }
  render(<Sections />);
  const block = within(screen.getByLabelText('Overview rail')).getByRole('button', { name: 'Jump to one' });
  expect(block.getAttribute('data-tip')).toBe(want ? `NC_045512 · ${want}` : 'NC_045512');
});


it('keeps a header and its rows inside one card with deterministic gaps and borders', () => {
  const { container } = render(<Subject />);
  const card = container.querySelector<HTMLElement>('[data-hub-card="one"]')!;
  expect(card).not.toBeNull();
  expect(within(card).getByText('one-gene')).toBeTruthy();
  expect(card.style.top).toBe('12px');
  expect(card.style.height).toBe('173px');
  expect(container.querySelector<HTMLElement>('[data-hub-card="two"]')!.style.top).toBe('197px');
});


it('pins the slim live bar as soon as the full header starts to scroll away and pushes it out at the card end', () => {
  const sequence = { ...records[0], features: Array.from({ length: 12 }, (_, i) => ({ name: `row${i}`, type: 'gene', start: i * 5, end: i * 5 + 4, strand: 1 as const })) };
  function Slim() { const state = useHubState(); return <HubList state={state} kind="sequences" height={180} items={buildSequenceSections([sequence, records[1]], state.filters, { grouped: false }, 'load')} />; }
  const { container } = render(<Slim />);
  const viewport = container.querySelector<HTMLElement>('.scrollbar-on-light')!;
  Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 180 }, scrollHeight: { configurable: true, value: 1000 } });
  expect(screen.queryByRole('region', { name: 'Pinned section' })).toBeNull();
  fireEvent.scroll(viewport, { target: { scrollTop: 15 } });
  const collapsing = screen.getByRole('region', { name: 'Pinned section' });
  expect(Number.parseFloat(collapsing.style.height)).toBeGreaterThan(44);
  expect(collapsing.querySelector<HTMLElement>('[data-pinned-expanded]')!.style.opacity).toBe('1');
  expect(collapsing.dataset.compact).toBe('false');
  fireEvent.scroll(viewport, { target: { scrollTop: 141 } });
  const bar = screen.getByRole('region', { name: 'Pinned section' });
  expect(bar.style.height).toBe('44px');
  expect(bar.style.left).toBe('14px');
  expect(bar.style.right).toBe('14px');
  expect(bar.className).toContain('border-x');
  expect(bar.dataset.compact).toBe('true');
  expect(bar.querySelector<HTMLElement>('[data-pinned-expanded]')!.style.opacity).toBe('0');
  expect(bar.querySelector<HTMLElement>('[data-pinned-compact]')!.style.opacity).toBe('1');
  const fullBand = container.querySelector<HTMLElement>('[data-hub-card="one"] [data-track-window]')!;
  const band = bar.querySelector<HTMLElement>('[data-pinned-compact] [data-track-window]')!;
  expect(band.style.left).toBe(fullBand.style.left);
  expect(band.style.width).toBe(fullBand.style.width);
  fireEvent.scroll(viewport, { target: { scrollTop: 650 } });
  expect(bar.style.top).toBe('-25px');
  // The first card has left; the second header has not yet reached the top edge in this short list.
  fireEvent.scroll(viewport, { target: { scrollTop: 670 } });
  expect(screen.queryByRole('region', { name: 'Pinned section' })).toBeNull();
});


it('uses one rail with proportional blocks, a draggable thumb, paging and hidden native scrollbar', () => {
  const sequence = { ...records[0], features: Array.from({ length: 20 }, (_, i) => ({ name: `f${i}`, type: 'gene', start: i * 4, end: i * 4 + 3, strand: 1 as const })) };
  function Rail() { const state = useHubState(); return <HubList state={state} kind="sequences" height={180} items={buildSequenceSections([sequence, records[1]], state.filters, { grouped: false }, 'load')} />; }
  const { container } = render(<Rail />);
  const viewport = container.querySelector<HTMLElement>('.scrollbar-on-light')!;
  expect(viewport.classList.contains('hub-scroll-region')).toBe(true);
  expect(viewport.tabIndex).toBe(0);
  const rail = screen.getByLabelText('Overview rail');
  const first = within(rail).getByRole('button', { name: 'Jump to one' });
  expect(first.tabIndex).toBe(-1);
  expect(first.style.top).toBe('6px');
  const thumb = rail.querySelector<HTMLElement>('[data-scroll-thumb]')!;
  expect(Number.parseFloat(thumb.style.height)).toBeGreaterThanOrEqual(24);
  fireEvent(thumb, new MouseEvent('pointerdown', { bubbles: true, clientY: 10 }));
  fireEvent(thumb, new MouseEvent('pointermove', { bubbles: true, clientY: 60 }));
  expect(viewport.scrollTop).toBeGreaterThan(0);
  const moved = viewport.scrollTop;
  fireEvent(thumb, new MouseEvent('pointerup', { bubbles: true }));
  fireEvent(thumb, new MouseEvent('pointermove', { bubbles: true, clientY: 90 }));
  expect(viewport.scrollTop).toBe(moved);
  fireEvent.click(rail, { clientY: 179 });
  expect(viewport.scrollTop).toBeGreaterThan(moved);
  fireEvent.click(within(rail).getByRole('button', { name: 'Jump to two' }));
  expect(viewport.scrollTop).toBe(1021);
  expect(within(rail).getByRole('button', { name: 'Jump to two' }).getAttribute('aria-current')).toBe('true');
});


it('sizes feature presence rows from the card content width after margins and borders', () => {
  const values: SeqRecord[] = Array.from({ length: 52 }, (_, i) => ({ id: `pool${i}`, name: `pool${i}`, sequence: 'A'.repeat(100), features: [
    { type: 'source', name: 'source', start: 0, end: 100, strand: 1, metadata: { organism: 'Virus' } },
    { type: 'gene', name: 'shared', start: 10, end: 20, strand: 1 },
  ] }));
  function Cards() { const state = useHubState(); return <HubList kind="features" state={state} records={values} height={400} items={buildFeatureGroups(values, state.filters, false)} />; }
  const { container } = render(<Cards />);
  const presence = screen.getByRole('group', { name: 'Presence' });
  expect(presence.style.height).toBe('32px');
  expect(container.querySelector<HTMLElement>('[data-feature-surface]')!.style.height).toBe('106px');
  const row = container.querySelector<HTMLElement>('[data-row-key="pool0:1"]')!.parentElement!;
  expect(row.style.top).toBe('108px');
});


it('mounts a 200,000-interval track and focuses its full bounds', () => {
  const focused = vi.fn();
  const record: SeqRecord = { ...records[0], sequence: 'A'.repeat(400001), features: [], tracks: [{
    id: 'large', name: 'large signal', kind: 'line',
    data: Array.from({ length: 200000 }, (_, i) => ({ start: i * 2 + 1, end: i * 2 + 3, value: i })),
  }] };
  function LargeTrack() {
    const state = useHubState();
    return <HubList state={state} kind="sequences" height={400} onFocusItem={focused} items={buildSequenceSections([record], state.filters, { grouped: false }, 'load')} />;
  }
  render(<LargeTrack />);
  expect(screen.getByText('200000 data points')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open in viewport' }));
  expect(focused).toHaveBeenCalledWith({ recordId: 'one', start: 1, end: 400001, label: 'large signal', length: 400000 }, { key: 'one:track:large', label: 'large signal' });
});
