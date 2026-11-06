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
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import { NumberField } from '../search/fields';

function field(value: number | null, extra: Partial<Parameters<typeof NumberField>[0]> = {}) {
  const onChange = vi.fn();
  render(<NumberField label="Limit" value={value} onChange={onChange} min={1} step={10} {...extra} />);
  return onChange;
}

it.each([
  [100, 'Increase', 110], [100, 'Decrease', 90], [95, 'Increase', 100], [95, 'Decrease', 90], [5, 'Decrease', 1],
])('steps %i on round multiples (%s → %i)', (value, direction, expected) => {
  const onChange = field(value);
  fireEvent.click(screen.getByRole('button', { name: `${direction} Limit` }));
  expect(onChange).toHaveBeenCalledWith(expected);
});

it('steps up from Off to the minimum and cannot step down from Off', () => {
  const up = field(null, { min: 0, step: 5, max: 100, nullable: true });
  fireEvent.click(screen.getByRole('button', { name: 'Increase Limit' }));
  expect(up).toHaveBeenCalledWith(0);
  expect(screen.getByRole('button', { name: 'Decrease Limit' }).hasAttribute('disabled')).toBe(true);
});

it('steps down from the minimum back to Off', () => {
  const down = field(0, { min: 0, step: 5, max: 100, nullable: true });
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Limit' }));
  expect(down).toHaveBeenCalledWith(null);
});

it('disables Increase at max and reports an emptied input as null', () => {
  const onChange = field(100, { min: 0, step: 5, max: 100, nullable: true });
  expect(screen.getByRole('button', { name: 'Increase Limit' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Limit'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith(null);
});
