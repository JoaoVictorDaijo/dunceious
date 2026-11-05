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

import { describe, expect, it } from 'vitest';
import { translateSequence } from '@/src/domain/bio';
import { CODING_STRAND, PROTEIN, UNLOCK_TAPS, tapOutcome, templateStrand, transcribe } from '../easterEgg';

describe('central dogma easter egg', () => {
  it('spells the app name', () => {
    expect(PROTEIN).toBe('DUNCEIOUS');
  });

  it('needs recoding exactly where the standard code reads a stop', () => {
    // Standard table: U and O positions are stops ('_'); every other residue matches.
    expect(translateSequence(CODING_STRAND, 1)).toBe('D_NCEI__S');
  });

  it('pairs and transcribes the strands', () => {
    expect(templateStrand('GATTGA')).toBe('CTAACT');
    expect(transcribe('GATTGA')).toBe('GAUUGA');
  });

  it('counts down like Android before unlocking', () => {
    const outcomes = Array.from({ length: UNLOCK_TAPS }, (_, i) => tapOutcome(i + 1, false));
    expect(outcomes.map(o => (o.kind === 'countdown' ? o.remaining : o.kind))).toEqual([
      'silent', 'silent', 'silent', 3, 2, 1, 'unlock',
    ]);
    expect(tapOutcome(1, true)).toEqual({ kind: 'replay' });
  });
});
