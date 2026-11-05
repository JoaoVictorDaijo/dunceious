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

/** Taps on the version label that unlock the Central Dogma, as Android's build number does. */
export const UNLOCK_TAPS = 7;
/** The countdown toast starts once this many taps remain. */
const COUNTDOWN_FROM = 3;
/** Taps further apart than this restart the count. */
export const TAP_WINDOW_MS = 1500;
/**
 * Backdrop clicks are ignored this long after the egg opens: unlocking takes
 * rapid taps, and the surplus ones land on the overlay. A straggler can arrive
 * as late as a tap that would still have counted, hence the same window.
 */
export const CLOSE_GUARD_MS = TAP_WINDOW_MS;

/**
 * The coding strand that spells the app's name. U (selenocysteine) and O
 * (pyrrolysine) have no codon of their own: they are read from the UGA and
 * UAG stop codons when the cell recodes them, which is the joke.
 */
export const CODONS: ReadonlyArray<{ dna: string; aa: string; note?: string }> = [
  { dna: 'GAT', aa: 'D' },
  { dna: 'TGA', aa: 'U', note: 'Selenocysteine: a recoded UGA stop' },
  { dna: 'AAT', aa: 'N' },
  { dna: 'TGT', aa: 'C' },
  { dna: 'GAA', aa: 'E' },
  { dna: 'ATT', aa: 'I' },
  { dna: 'TAG', aa: 'O', note: 'Pyrrolysine: a recoded UAG stop' },
  { dna: 'TGA', aa: 'U', note: 'Selenocysteine: a recoded UGA stop' },
  { dna: 'TCT', aa: 'S' },
];

export const CODING_STRAND = CODONS.map(c => c.dna).join('');
export const PROTEIN = CODONS.map(c => c.aa).join('');

const PAIR: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' };

/** The template strand, base-paired position by position (read 3′→5′ left to right). */
export const templateStrand = (coding: string): string =>
  [...coding].map(b => PAIR[b] ?? 'N').join('');

/** The mRNA has the coding strand's sequence with uracil in place of thymine. */
export const transcribe = (coding: string): string => coding.replace(/T/g, 'U');

export type TapOutcome =
  | { kind: 'silent' }
  | { kind: 'countdown'; remaining: number }
  | { kind: 'unlock' }
  | { kind: 'replay' };

/** What the Nth consecutive tap does, Android-style; once unlocked, any tap reopens the finale. */
export function tapOutcome(taps: number, unlocked: boolean): TapOutcome {
  if (unlocked) return { kind: 'replay' };
  const remaining = UNLOCK_TAPS - taps;
  if (remaining <= 0) return { kind: 'unlock' };
  if (remaining <= COUNTDOWN_FROM) return { kind: 'countdown', remaining };
  return { kind: 'silent' };
}
