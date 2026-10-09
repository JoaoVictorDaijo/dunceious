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
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import DropZone from '../DropZone';

const files = { dataTransfer: { types: ['Files'] } };

function renderZone(props: Partial<React.ComponentProps<typeof DropZone>> = {}) {
  const onChange = vi.fn();
  const view = render(
    <DropZone accent="sky" icon="fa-folder-tree" title="Drop Input Batch" hint="GB or FASTA"
      accept=".gb,.fasta" multiple tip="Open files" onChange={onChange} {...props} />,
  );
  const zone = view.container.querySelector('[data-drop]') as HTMLElement;
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...view, zone, input, onChange };
}

describe('DropZone', () => {
  it('renders the card idle with its file input', () => {
    const { zone, input } = renderZone();
    expect(zone.getAttribute('data-drop')).toBe('idle');
    expect(input.accept).toBe('.gb,.fasta');
    expect(input.multiple).toBe(true);
    expect(zone.getAttribute('data-tip')).toBe('Open files');
    expect(screen.getByText('GB or FASTA')).toBeTruthy();
  });

  it('shows it can take the files while they are dragged anywhere in the window', () => {
    const { zone } = renderZone({ armed: true });
    expect(zone.getAttribute('data-drop')).toBe('armed');
  });

  it('marks itself as the target under the cursor and invites the release', () => {
    const { zone, input } = renderZone({ armed: true });
    fireEvent.dragEnter(input, files);
    expect(zone.getAttribute('data-drop')).toBe('over');
    expect(screen.getByText('Release to load')).toBeTruthy();
    fireEvent.dragLeave(input, files);
    expect(zone.getAttribute('data-drop')).toBe('armed');
    expect(screen.getByText('GB or FASTA')).toBeTruthy();
  });

  it('stays over while the drag crosses its own children', () => {
    const { zone, input } = renderZone({ armed: true });
    fireEvent.dragEnter(zone, files);
    fireEvent.dragEnter(input, files);
    fireEvent.dragLeave(zone, files);
    expect(zone.getAttribute('data-drop')).toBe('over');
  });

  it('returns to idle on drop and still hands the files to the input handler', () => {
    const { zone, input, onChange, rerender } = renderZone({ armed: true });
    fireEvent.dragEnter(input, files);
    fireEvent.drop(input, files);
    fireEvent.change(input);
    expect(onChange).toHaveBeenCalledOnce();
    expect(zone.getAttribute('data-drop')).not.toBe('over');
    rerender(<DropZone accent="sky" icon="fa-folder-tree" title="Drop Input Batch" hint="GB or FASTA"
      accept=".gb,.fasta" tip="Open files" onChange={onChange} armed={false} />);
    expect(zone.getAttribute('data-drop')).toBe('idle');
  });

  it('never lights up while disabled', () => {
    const { zone, input } = renderZone({ armed: true, disabled: true });
    expect(input.disabled).toBe(true);
    expect(zone.getAttribute('data-drop')).toBe('idle');
    fireEvent.dragEnter(input, files);
    expect(zone.getAttribute('data-drop')).toBe('idle');
  });

  it('ignores drags that carry no files', () => {
    const { zone, input } = renderZone();
    fireEvent.dragEnter(input, { dataTransfer: { types: ['text/plain'] } });
    expect(zone.getAttribute('data-drop')).toBe('idle');
  });
});
