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

  it('shows the resolved reference in the select', () => {
    render(<ComparisonMenu settings={{ ...DEFAULT_ALIGNMENT_COMPARISON, referenceId: 'gone' }} onChange={vi.fn()}
      reference={wuhan} candidates={[wuhan, alpha]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));
    expect((screen.getByLabelText('Reference') as HTMLSelectElement).value).toBe('Wuhan-Hu-1');
  });

  it('closes on Escape, returning focus to the button, and on a click outside', () => {
    render(<ComparisonMenu settings={DEFAULT_ALIGNMENT_COMPARISON} onChange={vi.fn()} reference={wuhan} candidates={[wuhan]} />);
    const button = screen.getByRole('button', { name: 'Compare to reference' });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Reference comparison' }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Reference comparison' })).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('group', { name: 'Reference comparison' })).toBeNull();
  });

  it('offers dots only while highlighting differences', () => {
    render(<ComparisonMenu settings={{ ...DEFAULT_ALIGNMENT_COMPARISON, highlight: 'agreements' }} onChange={vi.fn()}
      reference={wuhan} candidates={[wuhan]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));
    expect((screen.getByRole('checkbox', { name: 'Show identical residues as dots' }) as HTMLInputElement).disabled).toBe(true);
  });
});

it('renders the panel in a portal above content and Escape returns focus', () => {
  const { container } = render(<ComparisonMenu settings={DEFAULT_ALIGNMENT_COMPARISON} onChange={vi.fn()} reference={wuhan} candidates={[wuhan, alpha]} />);
  const trigger = screen.getByRole('button', { name: 'Compare to reference' });
  fireEvent.click(trigger);
  const panel = screen.getByRole('group', { name: 'Reference comparison' });
  expect(container.contains(panel)).toBe(false);
  expect(panel.className).toContain('z-[60]');
  fireEvent.pointerDown(screen.getByRole('radio', { name: 'Identity' }));
  expect(screen.getByRole('group', { name: 'Reference comparison' })).toBe(panel);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('group', { name: 'Reference comparison' })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('carries the trigger theme variables into the body portal', () => {
  render(<ComparisonMenu settings={DEFAULT_ALIGNMENT_COMPARISON} onChange={vi.fn()} reference={wuhan} candidates={[wuhan]} />);
  const trigger = screen.getByRole('button', { name: 'Compare to reference' });
  trigger.style.setProperty('--env', '#b89cf3');
  trigger.style.setProperty('--env2', '#d7c5ff');
  trigger.style.setProperty('--env3', '#8f76c1');
  fireEvent.click(trigger);
  const panel = screen.getByRole('group', { name: 'Reference comparison' });
  expect(panel.style.getPropertyValue('--env')).toBe('#b89cf3');
  expect(panel.style.getPropertyValue('--env2')).toBe('#d7c5ff');
  expect(panel.style.getPropertyValue('--env3')).toBe('#8f76c1');
});

it('moves keyboard focus into the comparison panel when opened', () => {
  render(<ComparisonMenu settings={DEFAULT_ALIGNMENT_COMPARISON} onChange={vi.fn()} reference={wuhan} candidates={[wuhan]} />);
  const trigger = screen.getByRole('button', { name: 'Compare to reference' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Off' }));
});

it('reanchors after a toolbar render moves the trigger without a window resize', () => {
  let bottom = 80;
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.getAttribute('aria-label') === 'Compare to reference'
      ? { left: 400, right: 500, top: bottom - 40, bottom, width: 100, height: 40 } as DOMRect
      : { left: 0, right: 320, top: 0, bottom: 250, width: 320, height: 250 } as DOMRect;
  });
  try {
    const props = { settings: DEFAULT_ALIGNMENT_COMPARISON, onChange: vi.fn(), reference: wuhan, candidates: [wuhan] };
    const view = render(<ComparisonMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));
    expect(screen.getByRole('group', { name: 'Reference comparison' }).style.top).toBe('88px');
    bottom = 120;
    view.rerender(<ComparisonMenu {...props} compact />);
    expect(screen.getByRole('group', { name: 'Reference comparison' }).style.top).toBe('128px');
  } finally { rect.mockRestore(); }
});
