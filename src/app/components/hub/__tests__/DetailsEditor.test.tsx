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
import { render, screen, fireEvent, within, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { useFeatureManager } from '@/src/app/hooks/useFeatureManager';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { readDetails, writeDetails, validateDetail } from '@/src/domain/bio/details';
import type { SeqRecord } from '@/src/domain/bio/types';
import HubList from '../HubList';

const fasta: SeqRecord = { id: 'contig', name: 'contig', sequence: 'AAAA', features: [], importedFrom: 'camel.fa' };
function Subject({ initial = fasta }: { initial?: SeqRecord }) {
  const [records, setRecords] = useState([initial]);
  const manager = useFeatureManager(records, setRecords, null, () => {});
  const state = useHubState();
  return <><output aria-label="Saved details">{JSON.stringify(readDetails(records[0]))}</output>
    <output aria-label="Feature count">{records[0].features.length}</output>
    <HubList items={buildSequenceSections(records, state.filters, { grouped: false }, 'load')} records={records} kind="sequences" state={state} height={700} onSetRecordDetails={manager.setRecordDetails} />
  </>;
}
function open() {
  stubResizeObserver();
  fireEvent.click(within(screen.getByRole('region', { name: 'Pinned section' })).getByRole('button', { name: 'Edit details' }));
}
describe('sequence details editing', () => {
  it('saves an invalid edited date and displays its warning in the editor and details line', () => {
    render(<Subject />); open();
    fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: 'March 2014' } });
    const warning = validateDetail('collectionDate', 'March 2014')!;
    expect(screen.getByText(warning)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save details' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByLabelText('Saved details').textContent).toBe('{"collectionDate":"March 2014"}');
    const pinned = within(screen.getByRole('region', { name: 'Pinned section' }));
    expect(pinned.getByText('March 2014').closest('[data-detail]')?.className).toContain('text-amber-');
    expect(pinned.getByText('edited')).toBeTruthy();
    expect(pinned.getByTitle(warning)).toBeTruthy();
  });
  it('reverts a changed field to its imported value and keeps other edits', () => {
    const initial = writeDetails({ ...fasta, fileDetails: { collectionDate: '2014', host: 'camel' } }, { collectionDate: 'March 2014', host: 'bat' });
    render(<Subject initial={initial} />); open();
    fireEvent.click(screen.getByRole('button', { name: "Revert Collection date to the file's value" }));
    expect((screen.getByLabelText('Collection date') as HTMLInputElement).value).toBe('2014');
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByLabelText('Saved details').textContent).toBe('{"host":"bat","collectionDate":"2014"}');
  });
  it('creates source details on FASTA without adding an annotation and can revert to an absent file value', () => {
    render(<Subject />); open();
    expect(screen.getByText('/organism')).toBeTruthy();
    expect(screen.getByText('/geo_loc_name')).toBeTruthy();
    const location = screen.getByLabelText('Location') as HTMLInputElement;
    expect(location.placeholder).toContain('Saudi Arabia');
    expect(document.getElementById(location.getAttribute('list')!)?.querySelector('option[value="Oman"]')).toBeTruthy();
    expect(screen.getByText('camel.fa')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'camel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByLabelText('Saved details').textContent).toBe('{"host":"camel"}');
    expect(screen.getByLabelText('Feature count').textContent).toBe('1');
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText(/0 annotations/)).toBeTruthy();
    open(); fireEvent.click(screen.getByRole('button', { name: "Revert Host to the file's value" }));
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByLabelText('Saved details').textContent).toBe('{}');
  });
  it('does not warn about unchanged historical file values and cancels drafts', () => {
    render(<Subject initial={writeDetails({ ...fasta, fileDetails: { location: 'Historical country' } }, { location: 'Historical country' })} />); open();
    expect(screen.queryByText(validateDetail('location', 'Historical country')!)).toBeNull();
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'bat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Saved details').textContent).toBe('{"location":"Historical country"}');
  });
});
