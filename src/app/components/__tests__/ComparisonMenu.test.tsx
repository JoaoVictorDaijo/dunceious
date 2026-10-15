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
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import ComparisonMenu from '../ComparisonMenu';
import { DEFAULT_ALIGNMENT_COMPARISON } from '@/src/app/logic/alignmentComparison';
import type { SeqRecord } from '@/src/domain/bio/types';

const rec = (id: string, extra: Partial<SeqRecord> = {}): SeqRecord => ({ id, name: id, sequence: 'ACGT', alignedSequence: 'ACGT', features: [], ...extra });
const wuhan = rec('Wuhan-Hu-1');
const alpha = rec('Alpha', { visible: false });

describe('ComparisonMenu', () => {
  it('stays closed and explains why without an alignment', () => {
    render(<ComparisonMenu settings={DEFAULT_ALIGNMENT_COMPARISON} onChange={vi.fn()} reference={null} candidates={[]}
      disabledReason="Comparison needs an alignment" />);
    const button = screen.getByRole('button', { name: 'Compare to reference' });
    fireEvent.click(button);
    expect(button.getAttribute('data-tip')).toBe('Comparison needs an alignment');
    expect(screen.queryByRole('group', { name: 'Reference comparison' })).toBeNull();
  });

  it('names the reference on the button while a comparison is on', () => {
    render(<ComparisonMenu settings={{ ...DEFAULT_ALIGNMENT_COMPARISON, highlight: 'disagreements' }} onChange={vi.fn()}
      reference={wuhan} candidates={[wuhan, alpha]} />);
    expect(screen.getByRole('button', { name: 'Compare to reference' }).textContent).toBe('vs Wuhan-Hu-1');
  });

  it('changes the highlight, the reference and the dots', () => {
    const onChange = vi.fn();
    render(<ComparisonMenu settings={{ ...DEFAULT_ALIGNMENT_COMPARISON, highlight: 'disagreements' }} onChange={onChange}
      reference={wuhan} candidates={[wuhan, alpha]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));

    fireEvent.click(screen.getByRole('radio', { name: 'Identity' }));
    expect(onChange).toHaveBeenLastCalledWith({ referenceId: null, highlight: 'agreements', matchDots: true });

    const select = screen.getByLabelText('Reference') as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.textContent)).toEqual(['Wuhan-Hu-1', 'Alpha (hidden)']);
    fireEvent.change(select, { target: { value: 'Alpha' } });
    expect(onChange).toHaveBeenLastCalledWith({ referenceId: 'Alpha', highlight: 'disagreements', matchDots: true });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show identical residues as dots' }));
    expect(onChange).toHaveBeenLastCalledWith({ referenceId: null, highlight: 'disagreements', matchDots: false });
  });

  it('offers dots only while highlighting differences', () => {
    render(<ComparisonMenu settings={{ ...DEFAULT_ALIGNMENT_COMPARISON, highlight: 'agreements' }} onChange={vi.fn()}
      reference={wuhan} candidates={[wuhan]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));
    expect((screen.getByRole('checkbox', { name: 'Show identical residues as dots' }) as HTMLInputElement).disabled).toBe(true);
  });
});
