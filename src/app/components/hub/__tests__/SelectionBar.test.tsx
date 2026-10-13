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
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import type { SeqRecord } from '@/src/domain/bio/types';
import { writeDetails, readDetails } from '@/src/domain/bio/details';
import SelectionBar from '../SelectionBar';
function Subject() {
  const state = useHubState();
  const [records, setRecords] = useState<SeqRecord[]>(['a', 'b', 'c'].map(id => writeDetails({ id, name: id, sequence: 'AAAA', features: [] }, id === 'a' ? { host: 'human' } : {})));
  return <><button onClick={() => state.setSelectedRecords(new Set(['a', 'b', 'c']))}>Select all</button><SelectionBar records={records} state={state} onSetDetail={(ids, key, value) => setRecords(prev => prev.map(r => ids.has(r.id) ? writeDetails(r, { [key]: value }) : r))} onToggleVisibility={() => {}} onRemoveRecords={() => {}} onExport={() => {}} onExportRows={() => {}} onDeleteRows={() => {}} /><div>{records.map(r => `${r.id}:${readDetails(r).host || '-'}`).join(',')}</div></>;
}
describe('SelectionBar', () => {
  it('fills only empty details by default and reports how many kept their value', () => {
    render(<Subject />); fireEvent.click(screen.getByText('Select all'));
    fireEvent.change(screen.getByLabelText('Detail field'), { target: { value: 'host' } });
    fireEvent.change(screen.getByLabelText('Detail value'), { target: { value: 'camel' } });
    expect((screen.getByLabelText('only where empty') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('a:human,b:camel,c:camel')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Set Host on 2 sequences · 1 already had a value and kept it');
  });
});
