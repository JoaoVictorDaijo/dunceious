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
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import RecordDetailsModal from '../RecordDetailsModal';
import type { SeqRecord } from '@/src/domain/bio/types';

describe('RecordDetailsModal biological coordinates', () => {
  it('shows the joined biological length and focuses every aligned part', () => {
    const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGTACGT', alignedSequence: '--A-CG--TA-C--GT--',
      features: [{ type: 'gene', name: 'joined', start: 0, end: 8, strand: 1,
        segments: [{ start: 0, end: 3 }, { start: 4, end: 8 }] }] };
    const onFocusFeature = vi.fn();
    render(<RecordDetailsModal record={record} feature={record.features[0]} onClose={() => {}}
      onFocusFeature={onFocusFeature} onExportRecord={() => {}} onCopyLog={() => {}} />);
    expect(screen.getByText('7 bp')).toBeTruthy();
    fireEvent.click(screen.getByText(/Focus/));
    expect(onFocusFeature).toHaveBeenCalledWith({ recordId: 'r', featureIndex: 0, start: 2, end: 16, label: 'joined', length: 7 });
  });
});

it('offers query bases only for a hit, shows staleness and removes search details', () => {
  const provenance = { v: 1, query: 'AC', mode: 'whole', alphabet: 'nucleotide', params: {}, strand: 1, cigar: '2=', span: { start: 0, end: 2, strand: 1 }, appVersion: '3.4.0', createdAt: '2026-10-16', exportNote: false };
  const feature = { name: 'hit', type: 'misc_feature', start: 0, end: 3, strand: 1 as const, metadata: { _searchHit: JSON.stringify(provenance) } };
  const remove = vi.fn(); const mode = vi.fn();
  render(<RecordDetailsModal record={{ id: 'r', name: 'r', sequence: 'ACG', features: [feature] }} feature={feature}
    onClose={vi.fn()} onFocusFeature={vi.fn()} onExportRecord={vi.fn()} onCopyLog={vi.fn()} onSetBasesMode={mode} onRemoveSearchDetails={remove} />);
  expect(screen.getByText("The search alignment no longer matches this annotation's region.")).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Query aligned to record' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove search details' }));
  expect(remove).toHaveBeenCalledOnce();
});
it('keeps joined annotations on record bases only', () => {
  const feature = { name: 'joined', type: 'misc_feature', start: 0, end: 3, strand: 1 as const, segments: [{ start: 0, end: 1 }, { start: 2, end: 3 }] };
  render(<RecordDetailsModal record={{ id: 'r', name: 'r', sequence: 'ACG', features: [feature] }} feature={feature}
    onClose={vi.fn()} onFocusFeature={vi.fn()} onExportRecord={vi.fn()} onCopyLog={vi.fn()} onSetBasesMode={vi.fn()} />);
  expect(screen.queryByRole('option', { name: 'Query aligned to record' })).toBeNull();
  expect(screen.getByText("The query layer isn't available for joined annotations.")).toBeTruthy();
});
