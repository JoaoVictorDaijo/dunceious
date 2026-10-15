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
import { expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import { createOriginCrossingRecord } from '@/src/app/testing/fixtures/originCrossing';
import GenomeStrip from '../GenomeStrip';
import { TrackTooltipProvider } from '../TrackTooltip';

const modes = [
  { name: 'header', props: { large: true } },
  { name: 'bare slim bar', props: { large: true, bare: true } },
  { name: 'two-lane slim', props: { large: true, slim: true } },
  { name: 'index mini strip', props: {} },
];
afterEach(() => vi.restoreAllMocks());
function rectangles(path: string) {
  return [...path.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+Z/g)]
    .map(match => ({ x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) }));
}

it.each(modes)('$name draws both joined pieces in one lane and pins both pieces', ({ props }) => {
  const record = createOriginCrossingRecord();
  const { container, rerender } = render(<GenomeStrip record={record} {...props} pinned={record.features[0]} />);
  for (const [index, positions] of [[0, [[0, 1758], [2426, 882]]], [1, [[0, 964], [2991, 317]]]] as const) {
    rerender(<GenomeStrip record={record} {...props} pinned={record.features[index]} />);
    const pieces = rectangles(container.querySelector('[data-strip-focus]')!.getAttribute('d')!);
    // Circular joins must preserve both biological pieces without filling the intervening span.
    expect(pieces).toHaveLength(2);
    expect(pieces[0].y).toBe(pieces[1].y);
    pieces.forEach((piece, i) => {
      expect(piece.x).toBeCloseTo(positions[i][0] / 3308 * 1000);
      expect(piece.width).toBeCloseTo(positions[i][1] / 3308 * 1000);
      expect(piece.width).toBeLessThan(1000);
    });
  }
});

it.each(modes)('$name hovers and picks the same feature on both pieces', ({ props }) => {
  const record = createOriginCrossingRecord();
  const pick = vi.fn();
  const { container, rerender } = render(<TrackTooltipProvider><GenomeStrip record={record} {...props} onPick={pick} pinned={record.features[0]} /></TrackTooltipProvider>);
  const svg = 'large' in props ? screen.getByRole('button', { name: /Genome strip/ }) : container.querySelector('[data-genome-strip]')!;
  const height = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height } as DOMRect);
  for (const [index, xs] of [[0, [500, 800]], [1, [100, 950]]] as const) {
    rerender(<TrackTooltipProvider><GenomeStrip record={record} {...props} onPick={pick} pinned={record.features[index]} /></TrackTooltipProvider>);
    const pieces = rectangles(container.querySelector('[data-strip-focus]')!.getAttribute('d')!);
    xs.forEach((x, i) => {
      const y = pieces[i].y + pieces[i].height / 2;
      fireEvent.mouseMove(svg, { clientX: x, clientY: y });
      expect(screen.getByRole('tooltip').textContent).toContain(record.features[index].name);
      fireEvent.click(svg, { clientX: x, clientY: y });
      expect(pick).toHaveBeenLastCalledWith(record.features[index]);
      fireEvent.mouseLeave(svg);
    });
  }
  expect(pick).toHaveBeenCalledTimes(4);
});
