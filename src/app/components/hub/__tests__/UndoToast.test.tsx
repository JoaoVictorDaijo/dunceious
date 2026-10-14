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
import { it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@/src/app/testing/renderHarness';
import { useFeatureManager } from '@/src/app/hooks/useFeatureManager';
import type { SeqRecord } from '@/src/domain/bio/types';
import UndoToast from '../UndoToast';

it('mounts an empty live region before announcing the deletion', () => {
  vi.useFakeTimers();
  try {
    render(<UndoToast onUndo={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('status').textContent).toBe('Annotation deleted');
  } finally { vi.useRealTimers(); }
});

it.each(['hover', 'focus'])('pauses Undo expiry while the toast has %s', mode => {
  vi.useFakeTimers();
  try {
    function Subject() {
      const [records, setRecords] = useState<SeqRecord[]>([{ id: 'r', name: 'r', sequence: 'AAAA', features: [{ name: 'a', type: 'gene', start: 0, end: 2, strand: 1 }] }]);
      const manager = useFeatureManager(records, setRecords, null, () => {});
      return <><button onClick={() => manager.removeFeature('r', 0)}>Delete</button>{manager.undoAvailable && <UndoToast onUndo={manager.undoDelete} onPause={manager.setUndoPaused} />}</>;
    }
    render(<Subject />); fireEvent.click(screen.getByText('Delete'));
    const undo = screen.getByRole('button', { name: 'Undo' });
    if (mode === 'hover') fireEvent.mouseEnter(document.querySelector('[data-undo-toast]')!); else fireEvent.focus(undo);
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    if (mode === 'hover') fireEvent.mouseLeave(document.querySelector('[data-undo-toast]')!); else fireEvent.blur(undo);
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  } finally { vi.useRealTimers(); }
});

it('disables Undo while alignment is locked', () => {
  render(<UndoToast onUndo={() => {}} locked />);
  expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
});
