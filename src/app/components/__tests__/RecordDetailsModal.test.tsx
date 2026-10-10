/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
    expect(onFocusFeature).toHaveBeenCalledWith({ recordId: 'r', start: 2, end: 16, label: 'joined', length: 7 });
  });
});
