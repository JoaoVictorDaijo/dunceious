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
import { describe, it, expect } from 'vitest';
import { useLayoutEffect } from 'react';
import { render, screen, fireEvent, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
import type { SeqRecord } from '@/src/domain/bio/types';
import HubList from '../HubList';

type Tab = 'sequences' | 'features';
const values: SeqRecord[] = ['NC_045512', 'NC_019843', 'third'].map((id, group) => ({
  id, name: id, sequence: 'A'.repeat(1000),
  features: Array.from({ length: 20 }, (_, row) => ({ type: 'gene', name: id, start: group * 100 + row * 4, end: group * 100 + row * 4 + 3, strand: 1 as const })),
}));
function Subject({ kind, height }: { kind: Tab; height: number }) {
  const state = useHubState();
  useLayoutEffect(() => state.setTab(kind), [kind]);
  const items = kind === 'sequences'
    ? buildSequenceSections(values, state.filters, { grouped: false }, 'load')
    : buildFeatureGroups(values, state.filters, false).sort((a, b) => values.findIndex(record => record.id === a.identity) - values.findIndex(record => record.id === b.identity));
  return <><output aria-label="Current section">{state.currentSectionKey}</output><HubList state={state} kind={kind} items={items} height={height} /></>;
}
function viewport(height: number) {
  const element = screen.getByRole('region', { name: 'Annotations' });
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: height },
    scrollHeight: { configurable: true, get: () => Number.parseFloat((element.firstElementChild as HTMLElement).style.height) },
  });
  return element;
}
function card(label: string) {
  const element = [...document.querySelectorAll<HTMLElement>('[data-hub-card]')].find(element => {
    const key = element.getAttribute('data-hub-card')!;
    return key === label || key.startsWith('[') && JSON.parse(key)[1] === label;
  });
  if (!element) throw new Error(`Card missing for ${label}`);
  return element;
}
function expectCurrent(label: string) {
  expect(screen.getByRole('button', { name: `Jump to ${label}` }).getAttribute('aria-current')).toBe('true');
  expect(card(label).classList.contains('hub-group-current')).toBe(true);
  expect(screen.getByLabelText('Current section').textContent).toBe(card(label).getAttribute('data-hub-card'));
}
function headerStart(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `Jump to ${label}` }));
  return Number.parseFloat(card(label).style.top) - 12;
}
function compact(bar: HTMLElement) { return bar.querySelector<HTMLElement>('[data-pinned-compact]')!; }
function scroll(element: HTMLElement, offset: number) { fireEvent.scroll(element, { target: { scrollTop: offset } }); }

describe('current group wiring', () => {
  it('switches at the reading line while the preceding bar stays pinned', () => {
    const kind = 'sequences';
    const height = 701;
    const line = 210;
    render(<Subject kind={kind} height={height} />);
    const element = viewport(height);
    const next = headerStart('NC_019843');
    scroll(element, next - line - 1);
    expectCurrent('NC_045512');
    const currentBar = screen.getByRole('region', { name: 'Pinned section' });
    expect(currentBar.style.borderColor).toContain('var(--env)');
    expect(currentBar.querySelector('[data-pinned-compact]')!.firstElementChild?.classList.contains('bg-amber-50')).toBe(true);
    scroll(element, next - line);
    expectCurrent('NC_019843');
    expect(Number.parseFloat(card('NC_045512').style.top) + Number.parseFloat(card('NC_045512').style.height)).toBeGreaterThan(element.scrollTop);
    const bar = screen.getByRole('region', { name: 'Pinned section' });
    expect(within(compact(bar)).getByText('NC_045512')).toBeTruthy();
    expect(bar.style.borderColor).toBe('');
    expect(bar.className).toContain('border-slate-300');
    expect(bar.querySelector('[data-pinned-compact]')!.firstElementChild?.classList.contains('bg-white')).toBe(true);
    expect(bar.querySelector('[data-pinned-compact]')!.firstElementChild?.classList.contains('bg-amber-50')).toBe(false);
    scroll(element, next + 400);
    expect(within(screen.getByRole('region', { name: 'Pinned section' }).querySelector<HTMLElement>('[data-pinned-compact]')!).getByText('NC_019843')).toBeTruthy();
    scroll(element, next - 60);
    expectCurrent('NC_019843');
    expect(card('NC_019843').querySelector('[data-section-surface]')?.classList.contains('bg-amber-50')).toBe(true);
  });

  it('keeps a rail jump to a folded group current until the offset moves beyond two pixels', () => {
    render(<Subject kind="features" height={700} />);
    fireEvent.click(within(card('NC_045512')).getByRole('button', { name: 'Collapse NC_045512' }));
    const element = viewport(700);
    expect(element.scrollTop).toBe(0);
    expectCurrent('NC_019843');
    fireEvent.click(screen.getByRole('button', { name: 'Jump to NC_045512' }));
    expectCurrent('NC_045512');
    expect(card('NC_045512').getAttribute('data-folded')).toBe('true');
    scroll(element, element.scrollTop + 2);
    expectCurrent('NC_045512');
    scroll(element, element.scrollTop + 1);
    expectCurrent('NC_019843');
  });

});
