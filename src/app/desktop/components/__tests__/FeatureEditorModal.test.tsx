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
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import FeatureEditorModal from '../FeatureEditorModal';
import type { EditingFeatureState } from '@/src/app/shared/types/features';

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
    fireEvent.change(screen.getByDisplayValue('Synthetic element'), { target: { value: 'Renamed element' } });
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
