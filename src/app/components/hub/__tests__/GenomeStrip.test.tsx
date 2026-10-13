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
import type { SeqRecord } from '@/src/domain/bio/types';
import GenomeStrip from '../GenomeStrip';
import HubIndex from '../HubIndex';
import HubList from '../HubList';
const record: SeqRecord = { id: 'contig', name: 'contig', sequence: 'A'.repeat(100), features: [
  { type: 'gene', name: 'custom type', start: 0, end: 10, strand: 1 },
  { type: 'gene', name: 'own colour', start: 20, end: 30, strand: 1, color: '#abcdef' },
] };
const featureColors = { gene: '#123456' };
function Subject() {
  const state = useHubState();
  return <><HubIndex records={[record]} state={state} featureColors={featureColors} onToggleRecordVisibility={() => {}} />
    <HubList items={buildSequenceSections([record], state.filters, { grouped: false }, 'load')} kind="sequences" state={state} height={500} featureColors={featureColors} />
  </>;
}
describe('genome strip colours', () => {
  it('uses configured type colours while individual feature colours take precedence', () => {
    render(<GenomeStrip record={record} featureColors={featureColors} />);
    expect(screen.getByRole('button', { name: 'Jump to custom type' }).style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(screen.getByRole('button', { name: 'Jump to own colour' }).style.backgroundColor).toBe('rgb(171, 205, 239)');
  });
  it('reuses geometry across highlight changes and remounts of an immutable record', () => {
    const feature = { type: 'gene', name: 'cached', start: 10, end: 30, strand: 1 as const };
    Object.defineProperty(feature, 'start', { get: () => 10, configurable: true });
    const start = vi.spyOn(feature, 'start', 'get');
    const cachedRecord = { ...record, features: [feature] };
    const first = render(<GenomeStrip record={cachedRecord} highlight={() => true} />);
    expect(screen.getByRole('button', { name: 'Jump to cached' }).style.left).toBe('10%');
    start.mockClear();
    first.rerender(<GenomeStrip record={cachedRecord} highlight={() => false} />);
    expect(screen.getByRole('button', { name: 'Jump to cached' }).style.opacity).toBe('0.25');
    first.unmount();
    render(<GenomeStrip record={cachedRecord} highlight={() => true} />);
    expect(screen.getByRole('button', { name: 'Jump to cached' }).style.width).toBe('20%');
    expect(start).not.toHaveBeenCalled();
    start.mockRestore();
  });
  it('invalidates cached geometry and colours when immutable inputs change', () => {
    const pick = vi.fn();
    const first = render(<GenomeStrip record={record} featureColors={featureColors} onPick={pick} />);
    const updated = { ...record, features: [{ ...record.features[0], start: 40, end: 60 }] };
    first.rerender(<GenomeStrip record={updated} featureColors={{ gene: '#654321' }} onPick={pick} />);
    const button = screen.getByRole('button', { name: 'Jump to custom type' });
    expect(button.style.left).toBe('40%');
    expect(button.style.width).toBe('20%');
    expect(button.style.backgroundColor).toBe('rgb(101, 67, 33)');
    fireEvent.click(button);
    expect(pick).toHaveBeenCalledWith(updated.features[0]);
    first.rerender(<GenomeStrip record={updated} featureColors={{ gene: '#abcdef' }} onPick={pick} />);
    expect(button.style.backgroundColor).toBe('rgb(171, 205, 239)');
  });
  it('passes configured colours to both index and pinned-header strips', () => {
    render(<Subject />);
    for (const root of [screen.getByRole('region', { name: 'Pinned section' }), screen.getByRole('region', { name: 'Hub index' })]) {
      const strip = within(root).getByLabelText('Genome strip for contig');
      expect(within(strip).getByRole('button', { name: 'Jump to custom type' }).style.backgroundColor).toBe('rgb(18, 52, 86)');
      expect(within(strip).getByRole('button', { name: 'Jump to own colour' }).style.backgroundColor).toBe('rgb(171, 205, 239)');
    }
  });
});
