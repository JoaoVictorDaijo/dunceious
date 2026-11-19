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
import GapRemovalNotice from '../GapRemovalNotice';

const notices = [
  { token: 1, fileName: 'first.fa', records: [{ id: 'seq1', removed: 3 }, { id: 'seq2', removed: 1 }] },
  { token: 2, fileName: 'second.fa', records: [{ id: 'other', removed: 12 }] },
];

describe('GapRemovalNotice', () => {
  it('previews the first file and its gap counts, explains the rule and shows queue size', () => {
    render(<GapRemovalNotice notices={notices} onClose={vi.fn()} onLoad={vi.fn()} />);
    const dialog = screen.getByRole('alertdialog', { name: 'Remove alignment gaps?' });
    const text = dialog.textContent ?? '';
    expect(text).toContain('first.fa');
    expect(text).toContain('1 of 2');
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'seq13 gap characters', 'seq21 gap character',
    ]);
    expect(text).toContain('contains gap characters. Loaded as sequences, gaps are removed and positions refer to the ungapped sequence');
    expect(screen.getByRole('link', { name: /NCBI/ }).getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/genbank/fastaformat/');
    expect(text).toContain('load it as a pre-aligned FASTA instead');
  });

  it('closes from the button and from Escape', () => {
    const onClose = vi.fn();
    render(<GapRemovalNotice notices={notices} onClose={onClose} onLoad={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Load without gaps' }));
    fireEvent.click(screen.getByRole('button', { name: "Don't load" }));
    const windowEscape = vi.fn();
    window.addEventListener('keydown', windowEscape);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    window.removeEventListener('keydown', windowEscape);
    expect(onClose).toHaveBeenCalledTimes(2);
    // The viewer clears its selection on a window-level Escape.
    expect(windowEscape).not.toHaveBeenCalled();
  });
});
