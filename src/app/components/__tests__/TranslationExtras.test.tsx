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
import { expect, it } from 'vitest';
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import { TranslationExtras } from '../TranslationExtras';
it('offers all literal extra residues with numbered positions and keyboard End navigation', () => {
 render(<TranslationExtras extra="KVW" offset={2} />);
 fireEvent.click(screen.getByRole('button', { name: 'Show all 3 extra stored translation positions' }));
 expect(screen.getByRole('heading', { name: 'Extra stored translation positions' })).toBe(document.activeElement);
 const list = screen.getByRole('region', { name: 'Complete extra stored translation positions' });
 expect(list.textContent).toContain('3: K');
 expect(list.textContent).toContain('5: W');
 expect(list.getAttribute('tabindex')).toBe('0');
});
