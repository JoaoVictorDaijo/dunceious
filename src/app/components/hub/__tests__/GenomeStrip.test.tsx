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
import { render, screen, within, fireEvent } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { createHub100x60 } from '@/src/app/testing/fixtures/hub100x60';
import type { SeqRecord } from '@/src/domain/bio/types';
import GenomeStrip from '../GenomeStrip';
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
  return <><HubIndex records={[record]} state={state} featureColors={featureColors} onToggleRecordVisibility={noop} />
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
    expect(path.getAttribute('d')).toBe('M400 8h200v7h-200Z');
    expect(path.getAttribute('fill')).toBe('#654321');
    mockBounds(strip, 25);
    fireEvent.click(strip, { clientX: 500, clientY: 10 });
    expect(pick).toHaveBeenCalledWith(updated.features[0]);
    first.rerender(<GenomeStrip record={updated} featureColors={{ gene: '#abcdef' }} large onPick={pick} />);
    expect(strip.querySelector('path')!.getAttribute('fill')).toBe('#abcdef');
  });
  it('passes configured colours to decorative index and interactive pinned-header strips', () => {
    render(<Subject />);
    for (const root of [screen.getByRole('region', { name: 'Pinned section' }), screen.getByRole('region', { name: 'Hub index' })]) {
      expect([...root.querySelectorAll('svg path')].map(path => path.getAttribute('fill'))).toEqual(['#123456', '#abcdef']);
    }
    const indexStrip = screen.getByRole('region', { name: 'Hub index' }).querySelector('svg')!;
    expect(indexStrip.getAttribute('aria-hidden')).toBe('true');
    expect(indexStrip.hasAttribute('tabindex')).toBe(false);
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByRole('button', { name: 'Genome strip for contig: 2 annotations' })).toBeTruthy();
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
