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
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import type { SeqRecord } from '@/src/domain/bio/types';
import AnnotationHubPanel from '../AnnotationHubPanel';

const records: SeqRecord[] = ['first', 'last'].map(id => ({ id, name: id, sequence: 'AAAA', features: [{ name: id, type: 'gene', start: 0, end: 2, strand: 1 }] }));
const noop = () => {};
function Subject({ filtered = false, empty = false }: { filtered?: boolean; empty?: boolean }) {
  const state = useHubState();
  const { setFilters, setCurrentSectionKey } = state;
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setCurrentSectionKey(empty ? null : 'first');
    if (filtered) setFilters(previous => ({ ...previous, types: new Set(['gene']) }));
  }, [empty, filtered, setFilters, setCurrentSectionKey]);
  return <>
    <div data-hub-focus ref={setToolsSlot} />
    <output aria-label="Current section">{state.currentSectionKey ?? 'none'}</output>
    <button onClick={() => state.setFilters(previous => ({ ...previous, types: new Set() }))}>Remove type filter</button>
    <AnnotationHubPanel records={empty ? [] : records} state={state} toolsSlot={toolsSlot} featureColors={{}}
      onStartNewFeature={noop} onRemoveRecord={noop} onViewFeatureDetails={noop} onEditFeature={noop}
      onRemoveFeature={noop} onDeleteRows={noop} undoAvailable={false} onUndoDelete={noop}
      onSetRecordDetails={noop} onSetRecordLabel={noop} onSetDetail={noop} onFocusItem={noop}
      onExportProjectJson={noop} onExportRecords={noop} onClearAll={noop} addLog={noop}
      onFileUpload={noop} onAlignmentUpload={noop} onAnnotationUpload={noop} onProjectUpload={noop} onDroppedFiles={noop} />
  </>;
}
beforeEach(stubResizeObserver);
const hub = () => screen.getByRole('region', { name: 'Annotation Hub' });
const current = () => screen.getByLabelText('Current section').textContent;
const folded = () => screen.getAllByRole('button', { name: /^(Expand|Collapse) first$/ })[0].getAttribute('aria-expanded');

describe('hub section keys', () => {
  it('clamps brackets at the first and last sections', () => {
    render(<Subject />);
    expect(current()).toBe('first');
    fireEvent.keyDown(hub(), { key: '[' });
    expect(current()).toBe('first');
    fireEvent.keyDown(hub(), { key: ']' });
    expect(current()).toBe('last');
    fireEvent.keyDown(hub(), { key: ']' });
    expect(current()).toBe('last');
    fireEvent.keyDown(hub(), { key: '[' });
    expect(current()).toBe('first');
  });
  it('ignores bracket and fold keys with no sections', () => {
    render(<Subject empty />);
    for (const key of ['[', ']', 'o']) fireEvent.keyDown(hub(), { key });
    expect(current()).toBe('none');
  });
  it('toggles persistent folding without filters', () => {
    render(<Subject />);
    fireEvent.keyDown(hub(), { key: '[' });
    expect(folded()).toBe('true');
    fireEvent.keyDown(hub(), { key: 'o' });
    expect(folded()).toBe('false');
    fireEvent.keyDown(hub(), { key: 'o' });
    expect(folded()).toBe('true');
  });
  it('uses temporary folds under a filter and restores the unfiltered fold state', () => {
    render(<Subject filtered />);
    fireEvent.keyDown(hub(), { key: '[' });
    expect(folded()).toBe('true');
    fireEvent.keyDown(hub(), { key: 'o' });
    expect(folded()).toBe('false');
    fireEvent.keyDown(hub(), { key: 'o' });
    expect(folded()).toBe('true');
    fireEvent.keyDown(hub(), { key: 'o' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove type filter' }));
    expect(folded()).toBe('true');
  });
  it.each(['[', ']', 'o'])('suppresses %s inside the search input', key => {
    render(<Subject />);
    if (key === '[') fireEvent.keyDown(hub(), { key: ']' });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key });
    expect(current()).toBe(key === '[' ? 'last' : 'first');
    expect(folded()).toBe('true');
  });
  it.each(['altKey', 'ctrlKey', 'metaKey'])('suppresses navigation and folding with %s', modifier => {
    render(<Subject />);
    for (const key of ['[', ']', 'o']) fireEvent.keyDown(hub(), { key, [modifier]: true });
    expect(current()).toBe('first');
    expect(folded()).toBe('true');
  });
});
