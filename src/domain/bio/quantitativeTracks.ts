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


import type { DisplayTrack, QuantitativeTrack, ResidueRun, SeqRecord, TrackPiece } from './types';

/** Residue/column correspondence follows Biopython 1.88 inverse_indices (OP-4). */
export function residueRuns(record: SeqRecord): ResidueRun[] {
  if (!record.alignedSequence) return [{ column: 0, residue: 0, length: record.sequence.length }];
  const runs: ResidueRun[] = [];
  let residue = 0;
  for (let column = 0; column < record.alignedSequence.length; column++) {
    if (record.alignedSequence[column] === '-') continue;
    const last = runs[runs.length - 1];
    if (last && last.column + last.length === column) last.length++;
    else runs.push({ column, residue, length: 1 });
    residue++;
  }
  return runs;
}

export function buildDisplayTrack(track: QuantitativeTrack, runs: ResidueRun[], length: number): DisplayTrack {
  const display: DisplayTrack = { track, runs, placed: [], unplaced: [] };
  track.data.forEach(({ start, end, value }, index) => {
    const reason = !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || !Number.isFinite(value)
      ? 'invalid' : end > length ? 'out-of-range' : start === end ? 'empty' : null;
    if (reason) display.unplaced.push({ index, reason });
    else display.placed.push(index);
  });
  display.placed.sort((a, b) => track.data[a].start - track.data[b].start || track.data[a].end - track.data[b].end || a - b);
  for (const index of display.placed) alignedEnvelope(display, index);
  return display;
}

const recordDisplays = new WeakMap<SeqRecord, DisplayTrack[]>();

export function displayTracks(record: SeqRecord): DisplayTrack[] {
  if (record.displayTracks) return record.displayTracks;
  const cached = recordDisplays.get(record);
  if (cached) return cached;
  const runs = residueRuns(record);
  const displays = (record.tracks ?? []).map(track => buildDisplayTrack(track, runs, record.sequence.length));
  recordDisplays.set(record, displays);
  return displays;
}

function runAt(runs: ResidueRun[], position: number, biological: boolean): ResidueRun | undefined {
  let lo = 0, hi = runs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((biological ? runs[mid].residue : runs[mid].column) <= position) lo = mid + 1;
    else hi = mid;
  }
  const run = runs[lo - 1];
  return run && position < (biological ? run.residue : run.column) + run.length ? run : undefined;
}

const envelopeCaches = new WeakMap<DisplayTrack, Map<number, { start: number; end: number }>>();

export function alignedEnvelope(display: DisplayTrack, index: number): { start: number; end: number } {
  let cache = envelopeCaches.get(display);
  if (!cache) { cache = new Map(); envelopeCaches.set(display, cache); }
  const cached = cache.get(index);
  if (cached) return cached;
  const { start, end } = display.track.data[index];
  const first = runAt(display.runs, start, true)!;
  const last = runAt(display.runs, end - 1, true)!;
  const envelope = { start: first.column + start - first.residue, end: last.column + end - last.residue };
  cache.set(index, envelope);
  return envelope;
}

/** Gap columns have no biological position, including fractional pointers inside them. */
export function trackPosition(display: DisplayTrack, p: number): number | undefined {
  const column = Math.floor(p);
  const run = runAt(display.runs, column, false);
  return run ? run.residue + column - run.column : undefined;
}

/** UCSC bedGraph half-open membership; matches keep (source.start, source.end, source.index) order. */
export function pickTrackData(display: DisplayTrack, p: number): TrackPiece[] {
  const column = Math.floor(p);
  const run = runAt(display.runs, column, false);
  if (!run) return [];
  const residue = run.residue + column - run.column;
  const pieces: TrackPiece[] = [];
  for (const index of display.placed) {
    const { start, end, value } = display.track.data[index];
    if (start > residue || residue >= end) continue;
    pieces.push({ start: run.column + Math.max(start - run.residue, 0),
      end: run.column + Math.min(end - run.residue, run.length), value,
      source: { start, end, index }, envelope: alignedEnvelope(display, index) });
  }
  return pieces;
}

export function packTrackRows(display: DisplayTrack): number[][] {
  const rows: number[][] = [];
  const ends: number[] = [];
  for (const index of display.placed) {
    const bounds = alignedEnvelope(display, index);
    let row = ends.findIndex(end => bounds.start >= end);
    if (row < 0) { row = rows.length; rows.push([]); }
    rows[row].push(index);
    ends[row] = bounds.end;
  }
  return rows;
}

export function trackValueRange(display: DisplayTrack): { min: number; max: number } {
  if (!display.placed.length) return { min: 0, max: 1 };
  let min = Infinity, max = -Infinity;
  for (const index of display.placed) {
    min = Math.min(min, display.track.data[index].value);
    max = Math.max(max, display.track.data[index].value);
  }
  if (display.track.kind !== 'interval') { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) max++;
  return { min, max };
}

export function unplacedSummary(display: DisplayTrack): string {
  return `${display.unplaced.length.toLocaleString('en-US')} of ${display.track.data.length.toLocaleString('en-US')} intervals not drawn`;
}
