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
import { createOriginCrossingRecord } from '@/src/app/testing/fixtures/originCrossing';
import { it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@/src/app/testing/renderHarness';
import type { SeqRecord } from '@/src/domain/bio/types';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
import type { FeatureGroup, CellState } from '@/src/app/logic/featureComparison';
import FeatureSectionHeader, { featureSectionHeight } from '../FeatureSectionHeader';
import FilterBar from '../FilterBar';
import { useHubState } from '@/src/app/hooks/useHubState';
const states: CellState[] = ['present', 'odd', 'duplicate', 'missing', 'not-determined', 'unannotated', 'absent'];
const records: SeqRecord[] = states.map((state, i) => ({ id: state, accession: `NC_${i}`, label: `name ${i}`, name: state, sequence: 'A'.repeat(100), features: [{ type: 'CDS', name: 'enzyme', start: 0, end: 30, strand: 1 }] }));
const group: FeatureGroup = { key: 'enzyme', organism: 'virus', identity: 'enzyme', types: ['CDS'], medianStart: 0, rows: [{ record: records[0], feature: records[0].features[0] }], cells: states.map(state => ({ recordId: state, state })), counts: { present: 3, missing: 1, odd: 1, duplicate: 1, notDetermined: 1, pool: 7 }, accessory: false, compared: true };
it('uses fixed cells, type colour, explained state styles and sequence jumps', () => {
  const jump = vi.fn();
  render(<FeatureSectionHeader group={group} records={records} folded={false} onFold={() => {}} onSequence={jump} featureColors={{ CDS: 'purple' }} />);
  const cells = within(screen.getByRole('group', { name: 'Presence' })).getAllByRole('button');
  expect(cells.map(cell => cell.getAttribute('data-tip'))).toEqual(states.map((state, i) => `NC_${i} · name ${i}: ${state === 'not-determined' ? 'not determined (partial)' : state === 'odd' ? 'odd length' : state}`));
  // Fixed presence cells determine the virtual header's row count and height.
  for (const cell of cells) { expect(cell.style.width).toBe('14px'); expect(cell.style.height).toBe('14px'); expect(cell.hasAttribute('title')).toBe(false); }
  expect(cells[0].style.backgroundColor).toBe('purple');
  expect(cells[2].style.backgroundColor).toBe('purple');
  expect(cells[2].getAttribute('data-presence-state')).toBe('duplicate');
  expect(cells[1].getAttribute('data-presence-state')).toBe('odd');
  expect(screen.getByText('in 3 of 7 sequences')).toBeTruthy();
  fireEvent.click(cells[3]); expect(jump).toHaveBeenCalledWith('missing');
});
it.each([[1000, false, 140], [100, false, 176], [100, true, 156]] as const)('keeps header content and virtual height exact at width %i (folded %s)', (width, folded, expected) => {
  const { container } = render(<FeatureSectionHeader group={group} records={records} folded={folded} width={width} gap={8} onFold={() => {}} onSequence={() => {}} />);
  expect(featureSectionHeight(group, folded, width, 8)).toBe(expected);
  // Virtual header bounds must match the list's item size at every width.
  expect(container.querySelector<HTMLElement>('[data-section-entry]')!.style.height).toBe(`${expected}px`);
  const surface = container.querySelector<HTMLElement>('[data-feature-surface]')!;
  expect(surface.style.height).toBe(`${expected - 8}px`);
  const presence = within(surface).getByRole('group', { name: 'Presence' });
  expect(presence.style.height).toBe(width === 1000 ? '14px' : '50px');
  const blocks = [
    surface.querySelector<HTMLElement>('[data-feature-title]')!,
    surface.querySelector<HTMLElement>('[data-feature-stats]')!,
    surface.querySelector<HTMLElement>('[data-feature-comparison]')!,
    presence,
    ...(!folded ? [surface.querySelector<HTMLElement>('[data-feature-missing]')!] : []),
  ];
  // Content plus padding, borders and section gap must fit the virtual item without overflow.
  const contentHeight = blocks.reduce((sum, block) => sum + Number.parseFloat(block.style.height) + Number.parseFloat(block.style.marginTop || '0') + Number.parseFloat(block.style.marginBottom || '0'), 0);
  expect(contentHeight + 18 + 8).toBe(expected);
});
it('shows one legend sample for each occurring state after the type chips', () => {
  function Subject() { const state = useHubState(); return <FilterBar state={{ ...state, tab: 'features' }} types={new Map([['CDS', 1]])} keys={['enzyme']} groups={[group]} />; }
  render(<Subject />);
  const legend = screen.getByRole('group', { name: 'Presence legend' });
  expect(legend.querySelectorAll('[data-presence-state]')).toHaveLength(7);
  expect(legend.textContent).toContain('duplicate');
  expect(legend.textContent).toContain('odd length');
});


it.each([['pol', 'Median position 2,427 · 2,640–2,640 bp'], ['env', 'Median position 2,992 · 1,281–1,281 bp']] as const)('shows biological position and length for the %s origin crossing', (identity, summary) => {
  const record = createOriginCrossingRecord();
  const groups = buildFeatureGroups([record], { query: '', types: new Set(), strand: 'all', sequenceQuery: '', needsAttention: false }, false);
  const group = groups.find(group => group.identity === identity)!;
  render(<FeatureSectionHeader group={group} records={[record]} folded={false} onFold={() => {}} onSequence={() => {}} />);
  expect(screen.getByText(summary)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'J02442: present' })).toBeTruthy();
  expect(screen.queryByText(/\d+ odd length/)).toBeNull();
});
