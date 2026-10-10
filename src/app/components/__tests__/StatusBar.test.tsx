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
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/src/app/testing/renderHarness';
import StatusBar from '../StatusBar';

describe('StatusBar legal notices', () => {
  it('names the copyright holders and links the license and the source', () => {
    render(<StatusBar sessionMoleculeType={null} themeKey="clean" />);

    expect(screen.getByText('© 2026 João Victor Daijo & Murilo Cassiano')).toBeTruthy();
    expect(screen.getByRole('link', { name: /AGPL v3 or later/ }).getAttribute('href')).toBe(
      'https://www.gnu.org/licenses/agpl-3.0.html',
    );
    expect(screen.getByRole('link', { name: /Source Code/ }).getAttribute('href')).toBe(
      'https://github.com/JoaoVictorDaijo/dunceious',
    );
  });
});
