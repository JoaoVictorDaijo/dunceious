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

import { describe, it, expect } from 'vitest';
import { resolveEnvAccent } from '../environment';

describe('resolveEnvAccent', () => {
  it('is none when no molecule is loaded, regardless of tab', () => {
    expect(resolveEnvAccent('alignment', null)).toBe('none');
    expect(resolveEnvAccent('features', null)).toBe('none');
  });

  it('is the molecule environment in the viewport', () => {
    expect(resolveEnvAccent('alignment', 'nucleotide')).toBe('nucleotide');
    expect(resolveEnvAccent('alignment', 'protein')).toBe('protein');
  });

  it('is hub in the Database Hub when a molecule is loaded', () => {
    expect(resolveEnvAccent('features', 'nucleotide')).toBe('hub');
    expect(resolveEnvAccent('features', 'protein')).toBe('hub');
  });
});
