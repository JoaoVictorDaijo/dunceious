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


import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { processTransposition } from '../src/domain/bio/coordinate';
import { pickTrackData } from '../src/domain/bio/quantitativeTracks';
import { trackGeometry } from '../src/app/viewer/tracks/trackGeometry';

it('measures dense and overlapping quantitative display without piece expansion', () => {
  const sequence = 'A'.repeat(1_000_000);
  const alignedSequence = ('A'.repeat(200) + '--').repeat(5_000);
  const measurements: object[] = [];
  for (const mode of ['dense', 'overlapping'] as const) {
    const data = Array.from({ length: mode === 'dense' ? 200_000 : 20_000 }, (_, i) => ({
      start: mode === 'dense' ? i * 5 : i,
      end: mode === 'dense' ? i * 5 + 5 : 1_000_000 - i,
      value: i % 101,
    }));
    const started = performance.now();
    const display = processTransposition([{ id: 'r', name: 'r', sequence, alignedSequence, features: [], tracks: [{id:'q',name:mode,data}] }])[0].displayTracks![0];
    const buildMs = performance.now() - started;
    const redraw = [1_010_000, 101_000, 10_100].map(span => {
      const samples: number[] = [];
      let shapes = 0;
      for (let repeat = 0; repeat < 5; repeat++) {
        const t = performance.now();
        const geometry = trackGeometry(display, x => x * 1200 / span, [0, span]);
        samples.push(performance.now() - t); shapes = geometry.shapes.length;
      }
      return { span, shapes, geometryMs: samples };
    });
    let worstPickMs = 0;
    let matches = 0;
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      const result = pickTrackData(display, 505_000);
      worstPickMs = Math.max(worstPickMs, performance.now() - t); matches = result.length;
    }
    expect(display.placed).toHaveLength(data.length);
    expect(display.runs).toHaveLength(5_000);
    expect(matches).toBe(mode === 'dense' ? 1 : 20_000);
    measurements.push({ mode, intervals: data.length, buildMs, redraw, worstPickMs, peakRssMiB: process.resourceUsage().maxRSS / 1024, heapUsedMiB: process.memoryUsage().heapUsed / (1024 * 1024) });
  }
  mkdirSync('.code/docs', { recursive: true });
  writeFileSync('.code/docs/quantitative-bench.json', JSON.stringify(measurements, null, 2));
});
