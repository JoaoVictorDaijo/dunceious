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
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import FeatureEditorModal, { type EditingFeatureState } from '../FeatureEditorModal';

const editing: EditingFeatureState = { recordId: 'synthetic', featureIndex: -1,
  feature: { type: 'misc_feature', name: 'Synthetic element', start: 1, end: 8, strand: 1 } };
function show(state = editing) {
  const onChange = vi.fn();
  render(<FeatureEditorModal editing={state} records={[{ id: 'synthetic', name: 'synthetic', sequence: 'AACGTACGTA', features: [] }]}
    featureColors={{}} onChange={onChange} onSave={vi.fn()} onDiscard={vi.fn()} />);
  return onChange;
}

describe('annotation editor direction and name', () => {
  it('offers primer as a feature key and preserves its name and interval', () => {
    const change = show();
    fireEvent.change(screen.getByDisplayValue('misc_feature'), { target: { value: 'primer' } });
    expect(change).toHaveBeenLastCalledWith({ ...editing, feature: { ...editing.feature, type: 'primer' } });
  });
  it('preserves unknown direction when only the name is edited', () => {
    const state = { ...editing, feature: { ...editing.feature, metadata: { _gffStrand: '?', note: 'synthetic' } } };
    const change = show(state);
    expect(screen.getByDisplayValue('Unknown (?)')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Display Name' }), { target: { value: 'Renamed element' } });
    expect(change.mock.calls[0][0].feature).toMatchObject({ name: 'Renamed element', metadata: state.feature.metadata });
  });
  it('clears unknown provenance only when direction is explicitly chosen', () => {
    const state = { ...editing, feature: { ...editing.feature, metadata: { _gffStrand: '.', note: 'synthetic' } } };
    const change = show(state);
    fireEvent.change(screen.getByDisplayValue('Unstranded (.)'), { target: { value: '-1' } });
    expect(change.mock.calls[0][0].feature).toMatchObject({ strand: -1, metadata: { note: 'synthetic' } });
    expect(change.mock.calls[0][0].feature.metadata).not.toHaveProperty('_gffStrand');
  });
});

describe('qualifier editing', () => {
  const imported = { ...editing, featureIndex: 0, feature: { ...editing.feature,
    locationString: 'join(2..4,6..8)', metadata: { _gffStrand: '?', note: 'synthetic', gene: 'syn' } } };

  it('edits a qualifier value and keeps internal keys', () => {
    const change = show(imported);
    fireEvent.change(screen.getByDisplayValue('synthetic'), { target: { value: 'edited' } });
    expect(change.mock.calls[0][0].feature.metadata).toEqual({ _gffStrand: '?', note: 'edited', gene: 'syn' });
  });

  it('renames and removes qualifiers', () => {
    const change = show(imported);
    fireEvent.change(screen.getByDisplayValue('gene'), { target: { value: 'locus_tag' } });
    expect(change.mock.calls[0][0].feature.metadata).toEqual({ _gffStrand: '?', note: 'synthetic', locus_tag: 'syn' });
    fireEvent.click(screen.getByLabelText('Remove qualifier note'));
    expect(change.mock.calls[1][0].feature.metadata).not.toHaveProperty('note');
  });

  it('drops the preserved GenBank location once coordinates change', () => {
    const change = show(imported);
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '3' } });
    expect(change.mock.calls[0][0].feature).toMatchObject({ start: 3, locationString: undefined });
  });
});

it('refuses to render a source feature in the generic editor', () => {
  show({ ...editing, feature: { ...editing.feature, type: 'source' } });
  expect(screen.queryByText('Create Feature')).toBeNull();
  expect(screen.queryByText('Feature Key')).toBeNull();
});

it('offers the export note only on new hits, off by default', () => {
  const provenance = { v: 1, query: 'ACGTACG', mode: 'whole', alphabet: 'nucleotide', params: {}, strand: 1, cigar: '7=', span: { start: 1, end: 8, strand: 1 }, appVersion: '3.4.0', createdAt: '2026-10-16', exportNote: false };
  const change = show({ ...editing, feature: { ...editing.feature, metadata: { _searchHit: JSON.stringify(provenance) } } });
  const box = screen.getByRole('checkbox', { name: 'Add search details to the note' }) as HTMLInputElement;
  expect(box.checked).toBe(false);
  fireEvent.click(box);
  expect(JSON.parse(change.mock.calls[0][0].feature.metadata._searchHit).exportNote).toBe(true);
});

it.each([
  { start: 8, end: 2 }, { start: 0, end: 15 },
  { start: 0, end: 6, segments: [{ start: 0, end: 2, strand: 1 as const }, { start: 3, end: 6 }] },
])('blocks saving invalid geometry or partly stranded pieces %j', geometry => {
  show({ ...editing, feature: { ...editing.feature, ...geometry } });
  expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
});
it('shows a strand choice on every piece when any piece has a strand', () => {
  const change = show({ ...editing, feature: { ...editing.feature, segments: [{ start: 1, end: 3, strand: -1 }, { start: 5, end: 8 }] } });
  fireEvent.change(screen.getByLabelText('Segment 2 strand'), { target: { value: '1' } });
  expect(change.mock.calls[0][0].feature.segments[1].strand).toBe(1);
});

it('requires an explicit strand for a piece appended to a per-part feature', () => {
  function Subject() {
    const [state, setState] = useState<EditingFeatureState>({ ...editing, feature: { ...editing.feature, segments: [{ start: 1, end: 3, strand: -1 }, { start: 5, end: 8, strand: 1 }] } });
    return <FeatureEditorModal editing={state} records={[{ id: 'synthetic', name: 'synthetic', sequence: 'A'.repeat(200), features: [] }]} featureColors={{}} onChange={setState} onSave={vi.fn()} onDiscard={vi.fn()} />;
  }
  render(<Subject />);
  const save = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement;
  expect(save.disabled).toBe(false);
  fireEvent.click(screen.getByText('Add Segment'));
  expect(screen.getAllByRole('combobox', { name: /Segment .* strand/ })).toHaveLength(3);
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Segment 3 strand'), { target: { value: '-1' } });
  expect(save.disabled).toBe(false);
});

it('exposes the imported protein read-only and previews its replacement', () => {
  show({ ...editing, feature: { ...editing.feature, type: 'CDS', metadata: { translation: 'MK', _translationSource: 'imported' } } });
  expect((screen.getByLabelText('Value of translation') as HTMLTextAreaElement).readOnly).toBe(true);
  expect((screen.getByDisplayValue('translation') as HTMLInputElement).readOnly).toBe(true);
  expect((screen.getByRole('button', { name: 'Remove qualifier translation' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Imported · Read-only')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Translation computed at creation');
});

it('makes phase read-only and directs frame edits to codon_start', () => {
  const change = show({ ...editing, feature: { ...editing.feature, type: 'CDS', metadata: { phase: '1', codon_start: '2' } } });
  expect((screen.getByLabelText('Value of phase') as HTMLTextAreaElement).readOnly).toBe(true);
  expect((screen.getByDisplayValue('phase') as HTMLInputElement).readOnly).toBe(true);
  expect((screen.getByRole('button', { name: 'Remove qualifier phase' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Edit frame through/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Value of codon_start'), { target: { value: '3' } });
  expect(change.mock.calls[0][0].feature.metadata).toMatchObject({ phase: '1', codon_start: '3' });
});
it('keeps ordered repeated code-break rows outside scalar metadata', () => {
  const change = show({ ...editing, feature: { ...editing.feature, type: 'CDS', translationExceptions: ['(pos:1..3,aa:Sec)', '(pos:4..6,aa:Pyl)'] } });
  fireEvent.change(screen.getAllByLabelText('Value of transl_except')[1], { target: { value: '(pos:4..6,aa:Sec)' } });
  expect(change.mock.calls[0][0].feature.translationExceptions).toEqual(['(pos:1..3,aa:Sec)', '(pos:4..6,aa:Sec)']);
  expect(change.mock.calls[0][0].feature.metadata.transl_except).toBeUndefined();
});
