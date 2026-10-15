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
import { ExplainCallout, placeCallout } from '../ExplainCallout';

const viewport = { width: 844, height: 390 };
const size = { width: 300, height: 150 };

describe('placeCallout', () => {
  it('sits below the control, centred and kept on screen', () => {
    expect(placeCallout(new DOMRect(10, 10, 40, 30), size, viewport)).toEqual({ kind: 'anchored', top: 48, left: 8 });
    expect(placeCallout(new DOMRect(400, 10, 40, 30), size, viewport)).toEqual({ kind: 'anchored', top: 48, left: 270 });
  });

  it('goes above the control when there is no room below', () => {
    expect(placeCallout(new DOMRect(400, 300, 40, 30), size, viewport)).toEqual({ kind: 'anchored', top: 142, left: 270 });
  });

  it('becomes a bottom sheet without an anchor or room on either side', () => {
    expect(placeCallout(null, size, viewport)).toEqual({ kind: 'sheet' });
    expect(placeCallout(new DOMRect(400, 120, 40, 150), size, viewport)).toEqual({ kind: 'sheet' });
  });
});

describe('ExplainCallout', () => {
  it('names the control under the label, focuses Got it and closes on it', () => {
    const onClose = vi.fn();
    render(<ExplainCallout id="export" anchor={null} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    expect(dialog.textContent).toContain('In the workbench');
    expect(dialog.textContent).toContain('FASTA, GenBank, GFF3');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Got it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and gives focus back to the control that opened it', () => {
    const onClose = vi.fn();
    const { rerender } = render(<><button>Project</button></>);
    screen.getByRole('button', { name: 'Project' }).focus();
    rerender(<><button>Project</button><ExplainCallout id="project" anchor={null} onClose={onClose} /></>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<><button>Project</button></>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Project' }));
  });
});
