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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { createHub100x60 } from '@/src/app/testing/fixtures/hub100x60';
import type { SeqRecord } from '@/src/domain/bio/types';
import GenomeStrip from '../GenomeStrip';
import { createTrackWindow } from '../trackWindow';
import { TrackTooltipProvider } from '../TrackTooltip';
import HubIndex from '../HubIndex';
import HubList from '../HubList';
const record: SeqRecord = { id: 'contig', name: 'contig', sequence: 'A'.repeat(100), features: [
  { type: 'gene', name: 'custom type', start: 0, end: 10, strand: 1 },
  { type: 'gene', name: 'own colour', start: 20, end: 30, strand: 1, color: '#abcdef' },
] };
const featureColors = { gene: '#123456' };
const noop = () => {};
function Subject() {
  const state = useHubState();
  return <><HubIndex records={[record]} state={state} featureColors={featureColors} />
    <HubList items={buildSequenceSections([record], state.filters, { grouped: false }, 'load')} kind="sequences" state={state} height={500} featureColors={featureColors} />
  </>;
}
function mockBounds(svg: Element, height = 6) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height } as DOMRect);
}

describe('genome strips', () => {
  it('uses configured type colours while individual feature colours take precedence', () => {
    const { container } = render(<GenomeStrip record={record} featureColors={featureColors} />);
    expect([...container.querySelectorAll('path')].map(path => path.getAttribute('fill'))).toEqual(['#123456', '#abcdef']);
  });
  it('reuses geometry across highlight changes and remounts of an immutable record', () => {
    const feature = { type: 'gene', name: 'cached', start: 10, end: 30, strand: 1 as const };
    Object.defineProperty(feature, 'start', { get: () => 10, configurable: true });
    const start = vi.spyOn(feature, 'start', 'get');
    const cachedRecord = { ...record, features: [feature] };
    const first = render(<GenomeStrip record={cachedRecord} highlight={() => true} />);
    expect(first.container.querySelector('path')!.getAttribute('d')).toBe('M100 12.2h200v5.6h-200Z');
    start.mockClear();
    first.rerender(<GenomeStrip record={cachedRecord} highlight={() => false} />);
    expect(first.container.querySelector('path')!.getAttribute('opacity')).toBe('0.25');
    first.unmount();
    const second = render(<GenomeStrip record={cachedRecord} highlight={() => true} />);
    expect(second.container.querySelector('path')!.getAttribute('opacity')).toBe('1');
    expect(start).not.toHaveBeenCalled();
    start.mockRestore();
  });
  it('updates cached geometry and colours and hit-tests the updated feature', () => {
    const pick = vi.fn();
    const first = render(<GenomeStrip record={record} featureColors={featureColors} large onPick={pick} />);
    const updated = { ...record, features: [{ ...record.features[0], start: 40, end: 60 }] };
    first.rerender(<GenomeStrip record={updated} featureColors={{ gene: '#654321' }} large onPick={pick} />);
    const strip = screen.getByRole('button', { name: 'Genome strip for contig: 1 annotation' });
    const path = strip.querySelector('path')!;
    expect(path.getAttribute('d')).toBe('M400 9h200v10h-200Z');
    expect(path.getAttribute('fill')).toBe('#654321');
    mockBounds(strip, 25);
    fireEvent.click(strip, { clientX: 500, clientY: 10 });
    expect(pick).toHaveBeenCalledWith(updated.features[0]);
    first.rerender(<GenomeStrip record={updated} featureColors={{ gene: '#abcdef' }} large onPick={pick} />);
    expect(strip.querySelector('path')!.getAttribute('fill')).toBe('#abcdef');
  });
  it('passes configured colours to decorative index and interactive pinned-header strips', () => {
    render(<Subject />);
    for (const root of [document.querySelector<HTMLElement>('.hub-group-current')!, screen.getByRole('region', { name: 'Hub index' })]) {
      expect([...root.querySelectorAll('svg path')].map(path => path.getAttribute('fill'))).toEqual(['#123456', '#abcdef']);
    }
    const indexStrip = screen.getByRole('region', { name: 'Hub index' }).querySelector('svg')!;
    expect(indexStrip.getAttribute('aria-hidden')).toBe('true');
    expect(indexStrip.hasAttribute('tabindex')).toBe(false);
    expect(within(document.querySelector<HTMLElement>('.hub-group-current')!).getByRole('button', { name: 'Genome strip for contig: 2 annotations' })).toBeTruthy();
  });
  it('bounds SVG elements by lanes and distinct colours rather than annotation count', () => {
    const many = createHub100x60()[0];
    const highlight = (feature: typeof many.features[number]) => feature.start % 900 === 0;
    const { container, rerender } = render(<GenomeStrip record={many} highlight={highlight} />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('path').length).toBeLessThanOrEqual(8);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    const overridden = { ...many, features: many.features.map((feature, i) => i === 1 ? { ...feature, color: '#ff0000' } : feature) };
    rerender(<GenomeStrip record={overridden} highlight={highlight} />);
    expect(container.querySelectorAll('path').length).toBeLessThanOrEqual(10);
  });
  it('hit-tests both circular parts, authoritative joins and separate lanes', () => {
    const crossing = { name: 'wrap', type: 'gene', start: 90, end: 10, strand: 1 as const, segments: [{ start: 90, end: 100 }, { start: 0, end: 10 }] };
    const joined = { name: 'join', type: 'CDS', start: 20, end: 80, strand: -1 as const, segments: [{ start: 20, end: 30 }, { start: 70, end: 80 }] };
    const pick = vi.fn();
    render(<GenomeStrip record={{ ...record, features: [crossing, joined], isCircular: true }} large onPick={pick} />);
    const strip = screen.getByRole('button', { name: 'Genome strip for contig: 2 annotations' });
    mockBounds(strip, 34);
    fireEvent.click(strip, { clientX: 950, clientY: 10 });
    fireEvent.click(strip, { clientX: 50, clientY: 10 });
    fireEvent.click(strip, { clientX: 750, clientY: 24 });
    fireEvent.click(strip, { clientX: 500, clientY: 24 });
    expect(pick.mock.calls.map(call => call[0])).toEqual([crossing, crossing, joined]);
  });
  it('steps in position order, announces location and jumps by keyboard with visible feature focus', () => {
    const early = { ...record.features[0], name: 'early', start: 5, end: 15 };
    const late = { ...record.features[0], name: 'late', start: 60, end: 70 };
    const pick = vi.fn();
    render(<GenomeStrip record={{ ...record, features: [late, early] }} large onPick={pick} />);
    const strip = screen.getByRole('button', { name: 'Genome strip for contig: 2 annotations' });
    fireEvent.focus(strip);
    expect(screen.getByRole('status').textContent).toBe('early · 6..15');
    expect(strip.querySelector('[data-strip-focus]')).not.toBeNull();
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toBe('late · 61..70');
    fireEvent.keyDown(strip, { key: 'Enter' });
    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    fireEvent.keyDown(strip, { key: ' ' });
    expect(pick.mock.calls.map(call => call[0])).toEqual([late, early]);
    fireEvent.blur(strip);
    expect(strip.querySelector('[data-strip-focus]')).toBeNull();
  });
});

it('shows CDS hover details once per feature and exposes the same keyboard details', () => {
  const cds = { ...record.features[0], type: 'CDS', name: 'enzyme', end: 30, metadata: { codon_start: '2' } };
  render(<TrackTooltipProvider><GenomeStrip record={{ ...record, features: [cds] }} large onPick={noop} /></TrackTooltipProvider>);
  const strip = screen.getByRole('button', { name: /Genome strip/ });
  mockBounds(strip, 25);
  fireEvent.mouseMove(strip, { clientX: 50, clientY: 8 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip.textContent).toContain('30 bp · 9 aa');
  expect(tooltip.textContent).toContain('1..30');
  expect(tooltip.textContent).toContain('forward (+)');
  expect(tooltip.textContent).toContain('contig');
  expect(tooltip.textContent).toContain('Click to jump to the row');
  fireEvent.mouseMove(strip, { clientX: 60, clientY: 8 });
  expect(screen.getByRole('tooltip')).toBe(tooltip);
  fireEvent.mouseLeave(strip); expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.focus(strip); expect(screen.getByRole('tooltip').textContent).toContain('enzyme');
});

it('clears hover details when a virtual strip unmounts', () => {
  const { rerender } = render(<TrackTooltipProvider><GenomeStrip record={record} large onPick={noop} /></TrackTooltipProvider>);
  const strip = screen.getByRole('button', { name: /Genome strip/ }); mockBounds(strip, 25);
  fireEvent.mouseMove(strip, { clientX: 50, clientY: 10 }); expect(screen.getByRole('tooltip')).toBeTruthy();
  rerender(<TrackTooltipProvider><span>Other workspace</span></TrackTooltipProvider>);
  expect(screen.queryByRole('tooltip')).toBeNull();
});
it('keeps tooltip and outline on the keyboard cursor after pointer hover leaves', () => {
  render(<TrackTooltipProvider><GenomeStrip record={record} large onPick={noop} /></TrackTooltipProvider>);
  const strip = screen.getByRole('button', { name: /Genome strip/ }); mockBounds(strip, 25);
  fireEvent.focus(strip);
  fireEvent.mouseMove(strip, { clientX: 250, clientY: 10 });
  expect(screen.getByRole('tooltip').textContent).toContain('own colour');
  fireEvent.keyDown(strip, { key: 'ArrowLeft' });
  expect(screen.getByRole('tooltip').textContent).toContain('custom type');
  expect(strip.querySelector('[data-strip-focus]')?.getAttribute('d')).toContain('M0 ');
  fireEvent.mouseLeave(strip);
  expect(screen.getByRole('tooltip').textContent).toContain('custom type');
});

it('releases the old hover when an immutable record is replaced', () => {
  const { rerender } = render(<TrackTooltipProvider><GenomeStrip record={record} large onPick={noop} /></TrackTooltipProvider>);
  const strip = screen.getByRole('button', { name: /Genome strip/ }); mockBounds(strip, 25);
  fireEvent.mouseMove(strip, { clientX: 50, clientY: 10 });
  const replacement = { ...record, features: [{ ...record.features[0], name: 'replacement' }] };
  rerender(<TrackTooltipProvider><GenomeStrip record={replacement} large onPick={noop} /></TrackTooltipProvider>);
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(strip.querySelector('path')?.getAttribute('opacity')).toBe('1');
});

it('keeps ruler labels on one line and hides collisions on window changes and resize', () => {
  let resized = () => {};
  const observer = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(callback: () => void) { resized = callback; } observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  try {
    const { container } = render(<GenomeStrip record={{ ...record, sequence: 'A'.repeat(154000) }} large />);
    const ruler = container.querySelector<HTMLElement>('[data-track-ruler]')!;
    expect(ruler).toBeTruthy();
    const ticks = [...ruler.querySelectorAll<HTMLElement>('[data-track-tick]')];
    expect(ticks.every(tick => tick.className.includes('whitespace-nowrap'))).toBe(true);
    let right = 200;
    vi.spyOn(ruler, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, right, width: right } as DOMRect));
    const spans = [[20, 50], [55, 85], [90, 120], [125, 155], [155, 185], [175, 215]];
    ticks.forEach((tick, i) => vi.spyOn(tick, 'getBoundingClientRect').mockImplementation(() => ({ left: spans[i][0], right: spans[i][1] } as DOMRect)));
    const label = ruler.querySelector<HTMLElement>('[data-track-window-label]')!;
    label.hidden = false;
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue({ left: 160, right: 200 } as DOMRect);
    act(resized);
    expect(ticks.map(tick => tick.style.visibility)).toEqual(['visible', 'visible', 'visible', 'visible', 'hidden', 'hidden']);
    label.hidden = true; act(resized);
    expect(ticks[4].style.visibility).toBe('visible'); expect(ticks[5].style.visibility).toBe('hidden');
    right = 400; act(resized);
    expect(ticks[5].style.visibility).toBe('visible');
  } finally { globalThis.ResizeObserver = observer; vi.restoreAllMocks(); }
});


it('hides hover details on empty space after pointer focus and click', () => {
  render(<TrackTooltipProvider><GenomeStrip record={record} large onPick={noop} /></TrackTooltipProvider>);
  const strip = screen.getByRole('button', { name: /Genome strip/ });
  mockBounds(strip, 25);
  fireEvent.mouseMove(strip, { clientX: 50, clientY: 10 });
  fireEvent.pointerDown(strip, { clientX: 50, clientY: 10, button: 0 });
  fireEvent.focus(strip);
  fireEvent.click(strip, { clientX: 50, clientY: 10 });
  fireEvent.mouseMove(strip, { clientX: 500, clientY: 10 });
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('shows cursor details after keyboard Tab focus', () => {
  render(<TrackTooltipProvider><GenomeStrip record={record} large onPick={noop} /></TrackTooltipProvider>);
  fireEvent.keyDown(document, { key: 'Tab' });
  fireEvent.focus(screen.getByRole('button', { name: /Genome strip/ }));
  expect(screen.getByRole('tooltip').textContent).toContain('custom type');
});

it('draws the brush only over lanes with dashed borders and no handles', () => {
  const { container } = render(<GenomeStrip record={record} large onPick={noop} />);
  const band = container.querySelector('[data-track-window]')!;
  expect(band.parentElement?.contains(container.querySelector('[data-track-ruler]'))).toBe(false);
  expect(band.querySelector('[stroke-dasharray="4 2"]')).toBeTruthy();
  expect(band.querySelectorAll('[data-window-handle]')).toHaveLength(0);
});

it('keeps the window unchanged on empty-space clicks and pointer drags', () => {
  const trackWindow = createTrackWindow();
  const pick = vi.fn();
  const { container } = render(<GenomeStrip record={record} large onPick={pick} trackWindow={trackWindow} />);
  const strip = screen.getByRole('button', { name: /Genome strip/ });
  mockBounds(strip, 29);
  act(() => trackWindow.update({ id: record.id, length: 100, start: 0, end: 30 }));
  fireEvent.pointerDown(strip, { clientX: 600, clientY: 2, button: 0, pointerId: 1 });
  fireEvent.pointerMove(strip, { clientX: 800, clientY: 2, pointerId: 1 });
  fireEvent.pointerUp(strip, { pointerId: 1 });
  fireEvent.click(strip, { clientX: 800, clientY: 2 });
  expect(container.querySelector<HTMLElement>('[data-track-window]')!.style.left).toBe('0%');
  expect(pick).not.toHaveBeenCalled();
  fireEvent.click(strip, { clientX: 50, clientY: 12 });
  expect(pick).toHaveBeenCalledWith(record.features[0]);
});

it('ignores Shift arrows instead of moving the row window or keyboard cursor', () => {
  const pick = vi.fn();
  render(<GenomeStrip record={record} large onPick={pick} />);
  const strip = screen.getByRole('button', { name: /Genome strip/ });
  fireEvent.focus(strip);
  fireEvent.keyDown(strip, { key: 'ArrowRight', shiftKey: true });
  expect(screen.getByRole('status').textContent).toContain('custom type');
  expect(pick).not.toHaveBeenCalled();
});


it('keeps a pinned annotation outlined while hovering a different feature', () => {
  const record: SeqRecord = { id: 'pins', name: 'pins', sequence: 'A'.repeat(100), features: [
    { name: 'pin', type: 'gene', start: 10, end: 20, strand: 1 },
    { name: 'hover', type: 'CDS', start: 40, end: 50, strand: 1 },
  ] };
  const { container } = render(<GenomeStrip record={record} large pinned={record.features[0]} onPick={() => {}} />);
  const strip = container.querySelector('svg')!;
  vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 29 } as DOMRect);
  const outline = () => strip.querySelector('[data-strip-focus]')?.getAttribute('d');
  const original = outline();
  expect(original).toBeTruthy();
  fireEvent.mouseMove(strip, { clientX: 450, clientY: 7 });
  expect(outline()).toBe(original);
  expect([...strip.querySelectorAll('path')].some(path => path.getAttribute('opacity') === '0.25')).toBe(true);
});


it('keeps the slim window dashed border inside its twenty-pixel lanes', () => {
  const { container } = render(<GenomeStrip record={record} large slim />);
  const band = container.querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.parentElement!.style.height).toBe('20px');
  const border = band.querySelector('rect')!;
  expect(border.getAttribute('y')).toBe('1');
  expect(border.getAttribute('height')).toBe('18');
});


const crowded: SeqRecord = { id: 'crowded', name: 'crowded', sequence: 'A'.repeat(100), features: [
  ...[0, 10, 20, 30].map((start, i) => ({ name: `forward-${i}`, type: 'gene', start, end: 90, strand: 1 as const, color: ['red', 'blue', 'red', 'green'][i] })),
  { name: 'reverse-first', type: 'CDS', start: 10, end: 90, strand: -1 },
  { name: 'reverse-last', type: 'gene', start: 20, end: 80, strand: -1 },
  { name: 'unknown', type: 'gene', start: 40, end: 90, strand: 1, metadata: { _gffStrand: '?' } },
] };
it('uses two eight-pixel slim lanes without changing the packed full-track geometry', () => {
  const { container, rerender } = render(<GenomeStrip record={crowded} large />);
  const packedBox = container.querySelector('svg')!.getAttribute('viewBox');
  expect(Number(packedBox?.split(' ')[3])).toBeGreaterThanOrEqual(60);
  rerender(<GenomeStrip record={crowded} large slim />);
  const strip = container.querySelector('svg')!;
  expect(strip.getAttribute('viewBox')).toBe('0 0 1000 20');
  expect(strip.classList.contains('border')).toBe(false);
  expect(strip.classList.contains('ring-1')).toBe(true);
  const rectangles = [...strip.querySelectorAll('path[fill]:not([fill="none"])')].flatMap(path => [...(path.getAttribute('d') ?? '').matchAll(/M[\d.]+ ([\d.]+)h[\d.]+v([\d.]+)/g)]);
  expect(new Set(rectangles.map(match => Number(match[1])))).toEqual(new Set([1, 11]));
  expect(rectangles.every(match => Number(match[2]) === 8)).toBe(true);
  const separators = strip.querySelectorAll('[data-strip-separators]');
  expect(separators.length).toBeGreaterThan(0);
  expect([...separators].every(path => path.getAttribute('stroke-width') === '1' && path.getAttribute('vector-effect') === 'non-scaling-stroke')).toBe(true);
  rerender(<GenomeStrip record={crowded} large />);
  expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(packedBox);
});
it('picks and reports the topmost slim feature, and keeps pinned or visible features above filtered ones', () => {
  const pick = vi.fn();
  const { container, rerender } = render(<TrackTooltipProvider><GenomeStrip record={crowded} large slim onPick={pick} /></TrackTooltipProvider>);
  const bounds = () => vi.spyOn(container.querySelector('svg')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 20 } as DOMRect);
  bounds();
  fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 450, clientY: 5 });
  expect(within(screen.getByRole('tooltip')).getByText('unknown', { selector: 'strong' })).toBeTruthy();
  fireEvent.click(container.querySelector('svg')!, { clientX: 450, clientY: 5 });
  expect(pick).toHaveBeenLastCalledWith(crowded.features[6]);
  fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 450, clientY: 15 });
  expect(within(screen.getByRole('tooltip')).getByText('reverse-last')).toBeTruthy();
  fireEvent.mouseLeave(container.querySelector('svg')!);
  rerender(<TrackTooltipProvider><GenomeStrip record={crowded} large slim pinned={crowded.features[0]} onPick={pick} /></TrackTooltipProvider>);
  bounds();
  fireEvent.mouseMove(container.querySelector('svg')!, { clientX: 450, clientY: 5 });
  expect(within(screen.getByRole('tooltip')).getByText('forward-0')).toBeTruthy();
  fireEvent.click(container.querySelector('svg')!, { clientX: 450, clientY: 5 });
  expect(pick).toHaveBeenLastCalledWith(crowded.features[0]);
  expect(container.querySelector('[data-strip-focus]')).not.toBeNull();
  fireEvent.mouseLeave(container.querySelector('svg')!);
  rerender(<TrackTooltipProvider><GenomeStrip record={crowded} large slim highlight={feature => feature === crowded.features[1]} onPick={pick} /></TrackTooltipProvider>);
  bounds();
  fireEvent.click(container.querySelector('svg')!, { clientX: 450, clientY: 5 });
  expect(pick).toHaveBeenLastCalledWith(crowded.features[1]);
});
