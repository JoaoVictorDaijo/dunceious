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
import { createOriginCrossingRecord } from '@/src/app/testing/fixtures/originCrossing';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@/src/app/testing/renderHarness';
import AnnotationRow from '../AnnotationRow';
const noop = () => {};
it('keeps hover actions focusable, named and in details-edit-viewport-delete order', () => {
  const open = vi.fn();
  const { container } = render(<AnnotationRow record={{ id: 'x', name: 'x', sequence: 'AAAAAA', features: [] }} feature={{ name: 'gene', type: 'CDS', start: 0, end: 6, strand: 1 }} rowKey="x:0" kind="sequences" selected={false} current={false} lastFocused={false} onSelect={noop} onInspect={noop} onEdit={noop} onFocus={open} onDelete={noop} onCurrent={noop} onHover={noop} />);
  const actions = container.querySelector<HTMLElement>('[data-row-actions]')!;
  expect(actions).toBeTruthy();
  expect(within(actions).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Inspect gene on x', 'Edit gene on x', 'Open gene on x in viewport', 'Delete gene on x']);
  for (const button of within(actions).getAllByRole('button')) { expect(button.tabIndex).toBe(0); expect(button.dataset.tip).toBeTruthy(); button.focus(); expect(document.activeElement).toBe(button); }
  fireEvent.click(screen.getByRole('button', { name: 'Open gene on x in viewport' })); expect(open).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Forward strand').textContent).toBe('→');
});


it('shows feature identity, display name, actions and the last-focused state', () => {
  const record = { id: 'x', accession: 'NC_x', label: 'A very long display name '.repeat(20), name: 'x', sequence: 'AAAAAA', features: [] };
  const { container } = render(<AnnotationRow record={record} feature={{ name: 'A very long annotation name '.repeat(20), type: 'CDS', start: 0, end: 6, strand: 1 }} rowKey="x:0" kind="features" selected={false} current={false} lastFocused onSelect={noop} onInspect={noop} onEdit={noop} onFocus={noop} onDelete={noop} onCurrent={noop} onHover={noop} />);
  const cell = container.querySelector('[data-name-cell]')!;
  expect(cell).not.toBeNull();
  expect(cell.contains(container.querySelector('[data-row-actions]'))).toBe(true);
  expect(cell.contains(screen.getByText('Last focused'))).toBe(true);
  expect(cell.querySelector('[data-row-display-name]')?.textContent).toBe(record.label);
  const row = container.querySelector<HTMLElement>('[data-row-key]')!;
  expect(row.dataset.state).toBe('last-focused');
  // Amber identifies the focused annotation in the hub.
  expect(row.className).toContain('bg-amber-50');
});


it.each([['sequences', 0, 'join(2427..3308,1..1758)', '2,640 bp'], ['features', 1, 'join(2992..3308,1..964)', '1,281 bp']] as const)('shows the joined location and biological length in %s rows', (kind, index, location, length) => {
  const record = createOriginCrossingRecord();
  render(<AnnotationRow record={record} feature={record.features[index]} rowKey={`J02442:${index}`} kind={kind} selected={false} current={false} lastFocused={false} onSelect={noop} onInspect={noop} onEdit={noop} onFocus={noop} onDelete={noop} onCurrent={noop} onHover={noop} />);
  expect(screen.getByLabelText(`Location: ${location}`).textContent).toBe(location);
  expect(screen.getByText(length)).toBeTruthy();
});
