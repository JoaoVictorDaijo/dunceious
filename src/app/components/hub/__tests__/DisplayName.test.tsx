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
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { useFeatureManager } from '@/src/app/hooks/useFeatureManager';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
import type { SeqRecord } from '@/src/domain/bio/types';
import HubIndex from '../HubIndex';
import HubList from '../HubList';
const record: SeqRecord = { id: 'workspace', accession: 'NC_019843', name: 'definition', sequence: 'AAAA', features: [], label: 'EMC reference' };
function Subject({ initial = [record] }: { initial?: SeqRecord[] }) {
  const [records, setRecords] = useState(initial);
  const state = useHubState();
  const manager = useFeatureManager(records, setRecords, null, () => {});
  return <><output aria-label="Identity">{records[0].id} {records[0].accession} {records[0].name}</output>
    <button onClick={() => state.setTab('features')}>Features view</button><HubIndex records={records} state={state} onToggleRecordVisibility={() => {}} />
    <HubList records={records} items={state.tab === 'sequences' ? buildSequenceSections(records, state.filters, { grouped: false }, 'load') : buildFeatureGroups(records, state.filters, false)} kind={state.tab} state={state} height={500} onSetRecordLabel={manager.setRecordLabel} />
  </>;
}
describe('display names', () => {
  it('shows the name first and the monospace accession in both index and header', () => {
    render(<Subject />);
    for (const root of [screen.getByRole('button', { name: 'Jump to sequence workspace' }), screen.getByRole('region', { name: 'Pinned section' })]) {
      const name = within(root).getByText('EMC reference');
      const accession = within(root).getByText('NC_019843');
      expect(accession.className).toContain('font-mono');
      expect(name.compareDocumentPosition(accession) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it('renames without changing identity and Find sequence matches the new name', () => {
    render(<Subject />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Pinned section' })).getByRole('button', { name: 'Rename workspace' }));
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Camel reference' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(within(screen.getByRole('button', { name: 'Jump to sequence workspace' })).getByText('Camel reference')).toBeTruthy();
    expect(screen.getByLabelText('Identity').textContent).toBe('workspace NC_019843 definition');
    fireEvent.change(screen.getByLabelText('Find sequence'), { target: { value: 'camel reference' } });
    expect(screen.getByRole('button', { name: 'Jump to sequence workspace' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Find sequence'), { target: { value: 'EMC reference' } });
    expect(screen.queryByRole('button', { name: 'Jump to sequence workspace' })).toBeNull();
  });
});

it('keeps display names and accessions on Features rows and missing-sequence links', () => {
  const initial: SeqRecord[] = ['a', 'b', 'c'].map((id, index) => ({ ...record, id, label: `Isolate ${id}`, accession: `ACC_${id}`, features: [
    { type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { organism: 'MERS-CoV' } },
    { type: 'gene', name: index < 2 ? 'spike' : 'other', start: 0, end: 2, strand: 1 },
  ] }));
  render(<Subject initial={initial} />); fireEvent.click(screen.getByText('Features view'));
  fireEvent.click(screen.getByRole('button', { name: 'spike · in 2 of 3' }));
  const pinned = within(screen.getByRole('region', { name: 'Pinned section' }));
  const missing = pinned.getByRole('button', { name: 'Isolate c ACC_c' });
  expect(within(missing).getByText('ACC_c').className).toContain('font-mono');
  expect(screen.getByText('Isolate a').closest('[data-row-key]')?.textContent).toContain('ACC_a');
});

it('keeps a name draft when scrolling away unmounts its virtual entry', () => {
  render(<Subject initial={[record, ...Array.from({ length: 20 }, (_, i) => ({ ...record, id: `extra${i}`, label: undefined }))]} />);
  fireEvent.click(within(screen.getByRole('region', { name: 'Pinned section' })).getByRole('button', { name: 'Rename workspace' }));
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New draft' } });
  const viewport = screen.getByLabelText('Display name').closest('form')?.parentElement?.parentElement?.parentElement;
  if (!viewport) throw new Error('Missing virtual viewport');
  Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 500 }, scrollHeight: { configurable: true, value: 5000 } });
  fireEvent.scroll(viewport, { target: { scrollTop: 2000 } });
  expect(screen.queryByLabelText('Display name')).toBeNull();
  fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
  expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('New draft');
});
