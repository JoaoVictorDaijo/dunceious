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
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections, searchHits } from '@/src/app/logic/hubModel';
import { createHub100x60 } from '@/src/app/testing/fixtures/hub100x60';
import { annotationFeatures, isPartial, isUnannotated } from '@/src/domain/bio/recordStatus';
import { readDetails } from '@/src/domain/bio/details';
import { featureLength } from '@/src/app/logic/viewModel';
import HubList from '../HubList';
import FilterBar from '../FilterBar';

const records = createHub100x60();
const height = 600;

function Subject() {
  const state = useHubState();
  const [shown, setShown] = useState(true);
  const [loaded, setLoaded] = useState(records);
  const sections = buildSequenceSections(loaded, state.filters, { grouped: false }, 'load');
  const hits = searchHits(sections);
  return <>
    <button onClick={() => { state.resetWorkspace(); setLoaded([]); }}>Clear workspace</button>
    <button onClick={() => setLoaded(records)}>Load fixture</button>
    <output aria-label="Saved offset">{state.scrollOffset.sequences}</output>
    <button onClick={() => setShown(value => !value)}>Toggle list</button>
    <label>Annotation search<input value={state.filters.query} onChange={event => state.setFilters(prev => ({ ...prev, query: event.target.value }))} /></label>
    <button onClick={() => state.setJumpTarget({ key: hits[hits.length - 1], serial: 1 })}>Jump to last match</button>
    <FilterBar state={state} types={new Map()} keys={sections.map(section => section.key)} />
    {shown && sections.length > 0 && <HubList state={state} kind="sequences" items={sections} records={records} height={height} />}
  </>;
}

function expectPinned(id: string) {
  expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByRole('checkbox', { name: `Select sequence ${id}` })).toBeTruthy();
}

describe('100×60 hub acceptance fixture', () => {
  it('is deterministic, nucleotide-only and covers the agreed scale and biological cases', () => {
    expect(createHub100x60()).toEqual(records);
    expect(records).toHaveLength(100);
    expect(new Set(records.map(record => record.id)).size).toBe(100);
    expect(new Set(records.map(record => readDetails(record).organism)).size).toBe(2);
    expect(records.every(record => record.moleculeType === 'dna')).toBe(true);
    expect(records.filter(isUnannotated)).toHaveLength(2);
    expect(records.filter(record => !isUnannotated(record)).every(record => annotationFeatures(record).length === 60)).toBe(true);
    expect(records.some(isPartial)).toBe(true);
    const circular = records.find(record => record.isCircular);
    expect(circular).toBeDefined();
    const crossing = circular!.features.find(feature => feature.start > feature.end);
    expect(crossing).toBeDefined();
    expect(crossing!.segments).toHaveLength(2);
    expect(featureLength(circular!.sequence.length, crossing!.start, crossing!.end, crossing!.segments)).toBe(300);
  });

  it('keeps scroll frames out of shared state and saves the final position on unmount', () => {
    const { container } = render(<Subject />);
    const viewport = container.querySelector<HTMLElement>('.custom-scrollbar-pro.scrollbar-on-light');
    if (!viewport) throw new Error('Virtual viewport missing');
    Object.defineProperties(viewport, { clientHeight: { configurable: true, value: height }, scrollHeight: { configurable: true, value: 272448 } });
    fireEvent.scroll(viewport, { target: { scrollTop: 500 } });
    expectPinned('hub001');
    expect(screen.getByLabelText('Saved offset').textContent).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle list' }));
    expect(screen.getByLabelText('Saved offset').textContent).toBe('500');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle list' }));
    expect(container.querySelector<HTMLElement>('.custom-scrollbar-pro.scrollbar-on-light')!.scrollTop).toBe(500);
    expectPinned('hub001');
  });

  it('does not restore an old offset when workspace reset and list unmount happen together', () => {
    const { container } = render(<Subject />);
    const viewport = container.querySelector<HTMLElement>('.custom-scrollbar-pro.scrollbar-on-light');
    if (!viewport) throw new Error('Virtual viewport missing');
    Object.defineProperties(viewport, { clientHeight: { configurable: true, value: height }, scrollHeight: { configurable: true, value: 272448 } });
    fireEvent.scroll(viewport, { target: { scrollTop: 3000 } });
    expectPinned('hub002');
    fireEvent.click(screen.getByRole('button', { name: 'Clear workspace' }));
    expect(screen.getByLabelText('Saved offset').textContent).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Load fixture' }));
    expectPinned('hub001');
    expect(container.querySelector<HTMLElement>('.custom-scrollbar-pro.scrollbar-on-light')!.scrollTop).toBe(0);
  });

  it('keeps the correct pinned header through end scrolling, folding, density and a last-match jump', () => {
    const { container } = render(<Subject />);
    expectPinned('hub001');
    expect(container.querySelectorAll('[data-row-key]').length).toBeLessThan(100);
    const viewport = container.querySelector<HTMLElement>('.custom-scrollbar-pro.scrollbar-on-light');
    if (!viewport || !viewport.firstElementChild) throw new Error('Virtual viewport missing');
    const scrollHeight = Number.parseFloat((viewport.firstElementChild as HTMLElement).style.height);
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: height },
      scrollHeight: { configurable: true, get: () => Number.parseFloat((viewport.firstElementChild as HTMLElement).style.height) },
    });
    fireEvent.scroll(viewport, { target: { scrollTop: scrollHeight - height } });
    expectPinned('hub100');
    expect(screen.getAllByText('No annotations on this sequence').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expectPinned('hub100');
    expect(container.querySelectorAll('[data-row-key]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expectPinned('hub004');
    expect(container.querySelectorAll('[data-row-key]').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Density'), { target: { value: 'comfortable' } });
    expectPinned('hub003');

    fireEvent.change(screen.getByLabelText('Annotation search'), { target: { value: 'fixture-hit' } });
    expect(screen.getByLabelText('Overview rail').querySelectorAll('span').length).toBeLessThanOrEqual(height);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expectPinned('hub098');
    fireEvent.click(screen.getByRole('button', { name: 'Jump to last match' }));
    expectPinned('hub098');
    const lastRow = container.querySelector<HTMLElement>('[data-row-key="hub098:60"]');
    expect(lastRow).not.toBeNull();
    const top = Number.parseFloat(lastRow!.parentElement!.style.top) - viewport.scrollTop;
    expect(top).toBeGreaterThanOrEqual(148);
    expect(top + 64).toBeLessThanOrEqual(height);
    expect(container.querySelectorAll('[data-row-key]').length).toBeLessThan(100);
  });
});
