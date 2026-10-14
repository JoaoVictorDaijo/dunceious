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
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import AnnotationRow from '../AnnotationRow';
const noop = () => {};
it('keeps hover actions focusable, named and in details-edit-viewport-delete order', () => {
  const open = vi.fn();
  const { container } = render(<AnnotationRow record={{ id: 'x', name: 'x', sequence: 'AAAAAA', features: [] }} feature={{ name: 'gene', type: 'CDS', start: 0, end: 6, strand: 1 }} rowKey="x:0" kind="sequences" selected={false} current={false} lastFocused={false} onSelect={noop} onInspect={noop} onEdit={noop} onFocus={open} onDelete={noop} onCurrent={noop} onHover={noop} />);
  const actions = container.querySelector<HTMLElement>('[data-row-actions]')!;
  expect(actions).toBeTruthy();
  expect([...actions.querySelectorAll('button')].map(button => button.getAttribute('aria-label'))).toEqual(['Inspect gene on x', 'Edit gene on x', 'Open gene on x in viewport', 'Delete gene on x']);
  for (const button of actions.querySelectorAll('button')) { expect(button.tabIndex).toBe(0); expect(button.dataset.tip).toBeTruthy(); button.focus(); expect(document.activeElement).toBe(button); }
  fireEvent.click(screen.getByRole('button', { name: 'Open gene on x in viewport' })); expect(open).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Forward strand').className).toContain('bg-emerald-50');
});


it('keeps actions and the last-focused chip inside a single-line feature name cell', () => {
  const record = { id: 'x', accession: 'NC_x', label: 'A very long display name '.repeat(20), name: 'x', sequence: 'AAAAAA', features: [] };
  const { container } = render(<AnnotationRow record={record} feature={{ name: 'A very long annotation name '.repeat(20), type: 'CDS', start: 0, end: 6, strand: 1 }} rowKey="x:0" kind="features" selected={false} current={false} lastFocused onSelect={noop} onInspect={noop} onEdit={noop} onFocus={noop} onDelete={noop} onCurrent={noop} onHover={noop} />);
  const cell = container.querySelector('[data-name-cell]')!;
  expect(cell).not.toBeNull();
  expect(cell.contains(container.querySelector('[data-row-actions]'))).toBe(true);
  expect(cell.contains(screen.getByText('Last focused'))).toBe(true);
  expect(cell.className).toContain('flex-nowrap');
  expect(cell.querySelector('[data-row-display-name]')?.textContent).toBe(record.label);
  expect(cell.querySelector('[data-row-subtext]')?.className).toContain('truncate');
  expect(cell.querySelector('strong')?.className).toContain('shrink-0');
  const row = container.querySelector<HTMLElement>('[data-row-key]')!;
  expect(row.className).toContain('bg-amber-50');
  expect(row.className).toContain('shadow-[inset_0_0_0_1.5px_var(--env)]');
});
