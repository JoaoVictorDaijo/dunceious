// @vitest-environment jsdom
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

import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import { TrackTooltipProvider, useTrackTooltip } from '../hub/TrackTooltip';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { GenBankRefusalDialog, GenBankImportNotes } from '../GenBankImportDiagnostics';
import type { ImportDiagnosticFile } from '@/src/app/logic/genbankImport';

const file = (filename: string, n: number): ImportDiagnosticFile => ({ filename, findings: Array.from({ length: n }, (_, i) => ({ tier: 'warning', code: 'invalid-frame', record: { name: 'R', index: 1 }, feature: { key: 'CDS', name: `feature${i + 1}` }, message: `problem${i + 1}` })) });
it('shows concurrent files, limits visible rows, focuses Close and copies all details', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const close = vi.fn();
  const view = render(<GenBankRefusalDialog files={[file('a.gb', 22)]} onClose={close} />);
  expect(document.activeElement).toBe(screen.getByText('Close'));
  view.rerender(<GenBankRefusalDialog files={[file('a.gb', 22), file('b.gb', 1)]} onClose={close} />);
  expect(screen.getByRole('alertdialog').textContent).toContain("a.gb wasn't loaded");
  expect(screen.getByRole('alertdialog').textContent).toContain("b.gb wasn't loaded");
  expect(screen.getByText('and 2 more')).toBeDefined();
  fireEvent.click(screen.getByText('Copy details'));
  expect(writeText.mock.calls[0][0]).toContain('feature22');
  expect(writeText.mock.calls[0][0]).toContain('b.gb');
  fireEvent.click(screen.getByText('Close'));
  expect(close).toHaveBeenCalledOnce();
});
it('exposes all seven notes on expansion and copy, clears, and hides with no notes', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const clear = vi.fn();
  const view = render(<GenBankImportNotes files={[file('notes.gb', 7)]} onClear={clear} />);
  fireEvent.click(screen.getByText('7 import notes'));
  expect(screen.queryByText(/feature7/)).toBeNull();
  fireEvent.click(screen.getByText('Show all 7'));
  expect(screen.getByText(/feature7/)).toBeDefined();
  fireEvent.click(screen.getByText('Copy details'));
  expect(writeText.mock.calls[0][0]).toContain('feature7');
  fireEvent.click(screen.getByText('Clear notes'));
  expect(clear).toHaveBeenCalledOnce();
  view.rerender(<GenBankImportNotes files={[]} onClear={clear} />);
  expect(screen.queryByText(/import notes/)).toBeNull();
});

function Hover({ frame }: { frame: string }) {
  const update = useTrackTooltip();
  const feature: BioFeature = { type: 'CDS', name: 'coding', start: 0, end: 9, strand: 1, metadata: { codon_start: frame } };
  const record: SeqRecord = { id: 'R', name: 'R', sequence: 'ATGAAATAA', features: [feature] };
  return <button onClick={() => update({ record, feature, color: '#ffffff', x: 100, y: 100 }, feature)}>Hover</button>;
}
it.each(['4', '2junk'])('shows the frame reason in the Hub instead of an amino-acid count: %s', frame => {
  render(<TrackTooltipProvider><Hover frame={frame} /></TrackTooltipProvider>);
  fireEvent.click(screen.getByText('Hover'));
  const tooltip = screen.getByRole('tooltip').textContent;
  expect(tooltip).toContain(`/codon_start=${frame} is invalid`);
  expect(tooltip).not.toContain('NaN aa');
  expect(tooltip).not.toContain('2 aa');
});
