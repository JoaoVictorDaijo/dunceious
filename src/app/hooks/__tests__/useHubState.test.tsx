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
import { describe, expect, it } from 'vitest';
import { act, render, screen, fireEvent, renderHook } from '@/src/app/testing/renderHarness';
import { useState } from 'react';
import { useHubState } from '../useHubState';
import type { HubFilters } from '@/src/app/logic/hubModel';

describe('hub session state', () => {
  it('keeps state in the owner when its tab consumer unmounts and remounts', () => {
    const Consumer = ({ hub }: { hub: ReturnType<typeof useHubState> }) => <button onClick={() => {
      hub.setFilters(previous => ({ ...previous, query: 'ORF4b' }));
      hub.setSelectedRows(new Set(['seq:2']));
      hub.setSelectedRecords(new Set(['seq']));
      hub.setCollapsed({ sequences: new Set(['seq']), features: new Set(['feature']) });
      hub.setScrollOffset({ sequences: 123, features: 456 });
      hub.setGrouped(true);
      hub.setGroupField('host');
      hub.setSort('fewest');
      hub.setDensity('comfortable');
      hub.setTab('features');
    }}>{JSON.stringify([hub.filters.query, [...hub.selectedRows], [...hub.selectedRecords], [...hub.collapsed.sequences], [...hub.collapsed.features], hub.scrollOffset, hub.grouped, hub.groupField, hub.sort, hub.density, hub.tab])}</button>;
    const Owner = () => {
      const hub = useHubState();
      const [visible, setVisible] = useState(true);
      return <><button onClick={() => setVisible(value => !value)}>Switch workspace</button>{visible && <Consumer hub={hub} />}</>;
    };
    render(<Owner />);
    fireEvent.click(screen.getAllByRole('button')[1]);
    const saved = screen.getAllByRole('button')[1].textContent;
    expect(saved).toBe('["ORF4b",["seq:2"],["seq"],["seq"],["feature"],{"sequences":123,"features":456},true,"host","fewest","comfortable","features"]');
    fireEvent.click(screen.getByText('Switch workspace'));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByText('Switch workspace'));
    expect(screen.getAllByRole('button')[1].textContent).toBe(saved);
  });
  it.each([
    ['query', { query: 'S' }], ['types', { types: new Set(['CDS']) }], ['strand', { strand: 'rev' }],
    ['sequenceQuery', { sequenceQuery: 'seq' }], ['needsAttention', { needsAttention: true }], ['onlyIds', { onlyIds: new Set(['seq']) }],
  ] as [string, Partial<HubFilters>][])('clears search folds when %s changes while preserving normal folds', (_name, patch) => {
    const { result } = renderHook(useHubState);
    act(() => {
      result.current.setCollapsed({ sequences: new Set(['seq']), features: new Set(['feature']) });
      result.current.setSearchFolds(new Set(['search-fold']));
    });
    act(() => result.current.setFilters(previous => ({ ...previous, ...patch })));
    expect([...result.current.searchFolds]).toEqual([]);
    expect([...result.current.collapsed.sequences]).toEqual(['seq']);
    expect([...result.current.collapsed.features]).toEqual(['feature']);
  });
  it('preserves search folds for equivalent filters with new Set instances', () => {
    const { result } = renderHook(useHubState);
    act(() => result.current.setFilters(previous => ({ ...previous, types: new Set(['gene', 'CDS']), onlyIds: new Set(['a', 'b']) })));
    act(() => result.current.setSearchFolds(new Set(['fold'])));
    act(() => result.current.setFilters(previous => ({ ...previous, types: new Set(['CDS', 'gene']), onlyIds: new Set(['b', 'a']) })));
    expect([...result.current.searchFolds]).toEqual(['fold']);
  });
  it('keeps each tab folds and scroll position independent', () => {
    const { result } = renderHook(useHubState);
    act(() => {
      result.current.setCollapsed(previous => ({ ...previous, sequences: new Set(['seq']) }));
      result.current.setScrollOffset(previous => ({ ...previous, sequences: 123 }));
      result.current.setTab('features');
    });
    expect(result.current.collapsed.features.size).toBe(0);
    expect(result.current.scrollOffset.features).toBe(0);
    act(() => {
      result.current.setCollapsed(previous => ({ ...previous, features: new Set(['S']) }));
      result.current.setScrollOffset(previous => ({ ...previous, features: 456 }));
      result.current.setMenu('more');
      result.current.setEditingDetails('seq');
      result.current.setTab('sequences');
    });
    expect(result.current.scrollOffset).toEqual({ sequences: 123, features: 456 });
    expect([...result.current.collapsed.sequences]).toEqual(['seq']);
    expect([...result.current.collapsed.features]).toEqual(['S']);
    expect(result.current.menu).toBe('more');
    expect(result.current.editingDetails).toBe('seq');
  });
  it('starts each new owner with independent List state', () => {
    const first = renderHook(useHubState);
    act(() => first.result.current.setSelectedRecords(new Set(['seq'])));
    const second = renderHook(useHubState);
    expect(second.result.current).toMatchObject({ tab: 'sequences', grouped: false, groupField: 'organism', sort: 'load', density: 'compact', menu: null, editingDetails: null });
    expect(second.result.current.selectedRecords.size).toBe(0);
  });
});

it('clears search folds when the feature problem filter changes', () => {
  const { result } = renderHook(useHubState);
  act(() => result.current.setSearchFolds(new Set(['features:S'])));
  act(() => result.current.setOnlyProblems(true));
  expect(result.current.searchFolds.size).toBe(0);
});

it('resets workspace-dependent state while keeping grouping, sort and density preferences', () => {
  const { result } = renderHook(useHubState);
  act(() => {
    result.current.setGrouped(true); result.current.setGroupField('host'); result.current.setSort('fewest'); result.current.setDensity('comfortable');
    result.current.setSelectedRows(new Set(['r:0'])); result.current.setSelectedRecords(new Set(['r']));
    result.current.setFilters(f => ({ ...f, query: 'old', onlyIds: new Set(['r']) }));
    result.current.setJumpTarget({ key: 'r:0', serial: 1 }); result.current.setCurrentSectionKey('r');
    result.current.setScrollOffset({ sequences: 100, features: 200 }); result.current.setIndexFolds(new Set(['r']));
  });
  act(() => result.current.resetWorkspace());
  expect(result.current.selectedRows.size).toBe(0); expect(result.current.selectedRecords.size).toBe(0);
  expect(result.current.filters.query).toBe(''); expect(result.current.filters.onlyIds).toBeUndefined();
  expect(result.current.jumpTarget).toBeNull(); expect(result.current.currentSectionKey).toBeNull();
  expect(result.current.scrollOffset).toEqual({ sequences: 0, features: 0 }); expect(result.current.indexFolds.size).toBe(0);
  expect([result.current.grouped, result.current.groupField, result.current.sort, result.current.density]).toEqual([true, 'host', 'fewest', 'comfortable']);
});

it('reuses already empty search folds so urgent query edits do not invalidate deferred list props', () => {
  const { result } = renderHook(useHubState);
  const empty = result.current.searchFolds;
  act(() => result.current.setFilters(previous => ({ ...previous, query: 'spike' })));
  expect(result.current.searchFolds).toBe(empty);
});
