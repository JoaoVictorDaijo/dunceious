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
import * as d3 from 'd3';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, installCanvasRecorder, type CanvasRecorder } from '@/src/app/testing/renderHarness';
import { SequenceTrack, type SequenceTrackProps } from '@/src/app/viewer/tracks/SequenceTrack';

const ZOOM = 20; // > 12 so both translation and nucleotide glyphs draw

function props(seq: string): SequenceTrackProps {
  return {
    seq,
    moleculeType: 'dna',
    xScale: d3.scaleLinear().domain([0, seq.length]).range([0, seq.length * ZOOM]),
    viewportWidth: seq.length * ZOOM + 40, // whole sequence on screen
    height: 200,
    y: 100,
    zoomLevel: ZOOM,
    scrollX: 0,
    showTranslation: true,
    features: [{ type: 'CDS', name: 'cds', start: 0, end: seq.length, strand: 1 }],
    searchResults: [],
    allSearchResults: [],
    currentSearchIdx: -1,
  };
}

describe('SequenceTrack translation glyphs', () => {
  let recorder: CanvasRecorder;
  beforeEach(() => { recorder = installCanvasRecorder(); });

  it('draws the early-stop "!" glyph for a broken CDS (internal TAG stop)', () => {
    // ATG TAG GAG — the TAG stop is not the last codon → broken protein.
    render(<SequenceTrack {...props('ATGTAGGAG')} />);
    expect(recorder.texts()).toContain('!');
    expect(recorder.texts()).toContain('M'); // start codon still drawn
  });

  it('does not draw "!" for a valid CDS', () => {
    render(<SequenceTrack {...props('ATGCCCGAG')} />);
    expect(recorder.texts()).not.toContain('!');
    // Per-codon AA letters, not just the start residue: M(ATG) P(CCC) E(GAG). Pins
    // the draw loop's codon→residue mapping so an internal sense-codon mislabel fails.
    expect(recorder.texts()).toEqual(expect.arrayContaining(['M', 'P', 'E']));
  });
});
