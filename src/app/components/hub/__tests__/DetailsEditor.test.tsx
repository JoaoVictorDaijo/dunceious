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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { useFeatureManager } from '@/src/app/hooks/useFeatureManager';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { readDetails, writeDetails, validateDetail } from '@/src/domain/bio/details';
import type { SeqRecord } from '@/src/domain/bio/types';
import HubList from '../HubList';

const fasta: SeqRecord = { id: 'contig', name: 'contig', sequence: 'AAAA', features: [], importedFrom: 'camel.fa' };
function currentHeader(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-section-surface][data-state="current"], [data-feature-surface][data-state="current"]')!;
}
function Subject({ initial = fasta, many = false }: { initial?: SeqRecord; many?: boolean }) {
  const [records, setRecords] = useState([initial, ...(many ? Array.from({ length: 20 }, (_, i) => ({ ...fasta, id: `extra${i}` })) : [])]);
  const manager = useFeatureManager(records, setRecords, null, () => {});
  const state = useHubState();
  return <><output aria-label="Saved details">{JSON.stringify(readDetails(records[0]))}</output>
    <button onClick={() => manager.setRecordDetails('contig', { host: 'bat' })}>Bulk host bat</button><output aria-label="Feature count">{records[0].features.length}</output>
    <HubList items={buildSequenceSections(records, state.filters, { grouped: false }, 'load')} records={records} kind="sequences" state={state} height={many ? 300 : 700} onSetRecordDetails={manager.setRecordDetails} />
  </>;
}
function open() {
  stubResizeObserver();
  fireEvent.click(within(currentHeader()).getByRole('button', { name: 'Edit details' }));
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
    const pinned = within(currentHeader());
    expect(pinned.getByLabelText(`Warning: ${warning}`)).toBeTruthy();
    expect(pinned.getByText('· edited')).toBeTruthy();
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
    expect(location.placeholder).toBe('Country or Country:Region');
    expect(document.getElementById(location.getAttribute('list')!)?.querySelector('option[value="Oman"]')).toBeTruthy();
    expect(screen.getByText('camel.fa')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'camel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByLabelText('Saved details').textContent).toBe('{"host":"camel"}');
    expect(screen.getByLabelText('Feature count').textContent).toBe('1');
    expect(within(currentHeader()).getByText(/0 annotations/)).toBeTruthy();
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

it('keeps a details draft when scrolling away unmounts its virtual entry', () => {
  render(<Subject many />); open();
  fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'camel draft' } });
  const viewport = screen.getByRole('form', { name: 'Details for contig' }).closest<HTMLElement>('[data-hub-scroll-region]');
  if (!viewport) throw new Error('Missing virtual viewport');
  Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 300 }, scrollHeight: { configurable: true, value: 5000 } });
  fireEvent.scroll(viewport, { target: { scrollTop: 2000 } });
  expect(screen.queryByLabelText('Host')).toBeNull();
  fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
  expect((screen.getByLabelText('Host') as HTMLInputElement).value).toBe('camel draft');
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  expect(screen.getByLabelText('Saved details').textContent).toBe('{"host":"camel draft"}');
});
it('saves only fields changed inline and keeps a subsequent bulk edit to an untouched field', () => {
  render(<Subject initial={writeDetails(fasta, { host: 'camel' })} />); open();
  fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: '2014' } });
  fireEvent.click(screen.getByRole('button', { name: 'Bulk host bat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  expect(screen.getByLabelText('Saved details').textContent).toBe('{"host":"bat","collectionDate":"2014"}');
});

it('uses neutral placeholders that describe the expected format', () => {
  render(<Subject />); open();
  expect((screen.getByLabelText('Organism') as HTMLInputElement).placeholder).toBe('Not specified');
  expect((screen.getByLabelText('Host') as HTMLInputElement).placeholder).toBe('Not specified');
  expect((screen.getByLabelText('Location') as HTMLInputElement).placeholder).toBe('Country or Country:Region');
  expect((screen.getByLabelText('Collection date') as HTMLInputElement).placeholder).toBe('YYYY, Mon-YYYY or YYYY-MM-DD');
});
it('names each compact detail while omitting organism from the line', () => {
  render(<Subject initial={writeDetails(fasta, { organism: 'MERS-CoV', host: 'camel', location: 'Oman', collectionDate: '2014' })} />);
  const pinned = within(currentHeader());
  expect(pinned.getByText('Host:')).toBeTruthy();
  expect(pinned.getByText('Location:')).toBeTruthy();
  expect(pinned.getByText('Collected:')).toBeTruthy();
  expect(pinned.queryByText('MERS-CoV')).toBeNull();
});

it('opens a missing detail chip with focus on that field', () => {
  render(<Subject />);
  fireEvent.click(within(currentHeader()).getByRole('button', { name: '+ Host' }));
  expect(document.activeElement).toBe(screen.getByLabelText('Host'));
});

it('refocuses missing fields in an editor that is already mounted', () => {
  render(<Subject />);
  const pinned = within(currentHeader());
  fireEvent.click(pinned.getByRole('button', { name: '+ Host' }));
  fireEvent.click(pinned.getByRole('button', { name: '+ Location' }));
  expect(document.activeElement).toBe(screen.getByLabelText('Location'));
  fireEvent.click(pinned.getByRole('button', { name: '+ Location' }));
  expect(document.activeElement).toBe(screen.getByLabelText('Location'));
});
it('keeps an edited marker after an imported value is cleared', () => {
  const original = { ...writeDetails(fasta, { host: 'camel' }), fileDetails: { host: 'camel' } };
  render(<Subject initial={writeDetails(original, { host: '' })} />);
  const chip = within(currentHeader()).getByRole('button', { name: '+ Host' });
  expect(within(chip).getByText('edited')).toBeTruthy();
});

it('offers a named revert that restores the imported field value', () => {
  render(<Subject initial={writeDetails({ ...fasta, fileDetails: { host: 'camel' } }, { host: 'bat' })} />); open();
  const revert = screen.getByRole('button', { name: "Revert Host to the file's value" });
  expect(revert.getAttribute('data-tip')).toBe("Revert Host to the file's value");
  fireEvent.click(revert);
  expect((screen.getByLabelText('Host') as HTMLInputElement).value).toBe('camel');
});

it.each([true, false])('updates virtual editor height as warnings change (wide: %s)', wide => {
  let listener = () => {};
  const media = { matches: wide, addEventListener: (_: string, callback: () => void) => { listener = callback; }, removeEventListener: () => {} };
  vi.stubGlobal('matchMedia', () => media);
  try {
    render(<Subject />); open();
    const form = screen.getByRole('form', { name: 'Details for contig' });
    const entry = form.closest<HTMLElement>('[data-hub-entry]')!;
    // Exact heights keep the virtual list aligned when warnings and responsive fields change.
    expect(entry.style.height).toBe(wide ? '200px' : '284px');
    fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: 'March 2014' } });
    expect(entry.style.height).toBe(wide ? '236px' : '320px');
    const warning = screen.getByText(validateDetail('collectionDate', 'March 2014')!);
    expect(warning.getAttribute('data-tip')).toBe(warning.textContent);
    fireEvent.change(screen.getByLabelText('Collection date'), { target: { value: '2014' } });
    expect(entry.style.height).toBe(wide ? '200px' : '284px');
    media.matches = !wide;
    act(listener);
    expect(entry.style.height).toBe(wide ? '284px' : '200px');
  } finally { vi.unstubAllGlobals(); }
});
