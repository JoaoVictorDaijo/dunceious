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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@/src/app/testing/renderHarness';
import { withSearchHit } from '@/src/domain/bio/searchHit';
import type { BioFeature } from '@/src/domain/bio/types';
import { loadSampleRecords } from '../sampleWorkspace';
import { ShowroomDetails } from '../ShowroomDetails';
import type { ShowroomView } from '../useShowroomView';
import { explanation, expectExplains, gotIt, mountShowroom, noExplanation, openHub } from './showroomTestKit';

// The bundled sample has no annotation made from a search match, the only kind
// whose details offer "Remove search details"; one is added to the reference here.
const { HIT_NAME } = vi.hoisted(() => ({ HIT_NAME: 'showroom_hit' }));
vi.mock('../sampleWorkspace', async importOriginal => {
  const actual = await importOriginal<typeof import('../sampleWorkspace')>();
  const hit: BioFeature = withSearchHit({ type: 'misc_feature', name: HIT_NAME, start: 100, end: 106, strand: 1 }, {
    v: 1, query: 'GTTGGG', cigar: '6=', mode: 'iupac', alphabet: 'nucleotide', strand: 1, params: {},
    span: { start: 100, end: 106, strand: 1 }, appVersion: 'test', createdAt: '2026-10-17T00:00:00Z', exportNote: false,
  });
  return {
    ...actual,
    loadSampleRecords: () => actual.loadSampleRecords().map((record, index) => (index === 0 ? { ...record, features: [...record.features, hit] } : record)),
  };
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const sidebar = () => screen.getByRole('complementary', { name: 'Sidebar' });
const detailsHeading = () => screen.queryByRole('heading', { name: 'Annotation Details' });

function search(query: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
  fireEvent.change(within(sidebar()).getByPlaceholderText('Enter IUPAC sequence...'), { target: { value: query } });
  fireEvent.click(within(sidebar()).getByRole('button', { name: 'Search' }));
}

function inspect(name: string) {
  openHub();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search annotations' }), { target: { value: name } });
  fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^Inspect ${name} on NC_001604$`) })[0]);
  expect(detailsHeading()).toBeTruthy();
}

describe('the showroom details panel', () => {
  it('tap opens details while a search selection stands', () => {
    const view = mountShowroom();
    search('TAATACGACTCACTATAG');
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy();
    const part = view.container.querySelector('[data-viewer-record="NC_001604"] [data-annotation-part]');
    fireEvent.click(part!);
    expect(detailsHeading()).toBeTruthy();
    noExplanation();
    view.expectNoSideEffects();
  });

  it('details Focus works; copy, export, bases, show sequence and remove search details explain', () => {
    const view = mountShowroom();
    inspect(HIT_NAME);
    expectExplains(screen.getByRole('button', { name: /^Copy (feature sequence|region) \(/ }), 'Copy');
    expectExplains(screen.getByRole('button', { name: /^Copy$/ }), 'Copy');
    fireEvent.change(screen.getByRole('combobox', { name: 'Bases inside' }), { target: { value: 'record' } });
    expect(explanation('Show bases')).toBeTruthy();
    gotIt();
    expect((screen.getByRole('combobox', { name: 'Bases inside' }) as HTMLSelectElement).value).toBe('nothing');
    expectExplains(screen.getByRole('button', { name: 'Remove search details' }), 'Remove search details');
    expect(screen.getByRole('button', { name: 'Remove search details' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    inspect('DNA ligase');
    const show = screen.getByRole('switch', { name: 'Show sequence in viewer' });
    expectExplains(show, 'Show bases');
    expect(show.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Focus/ }));
    expect(detailsHeading()).toBeNull();
    expect(screen.getByRole('button', { name: 'Visual Viewport' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy();
    noExplanation();
    view.expectNoSideEffects();
  });
});

// Record details (no annotation) open only from the viewer's right-click menu,
// which the showroom explains instead, so Export is checked on the component.
it('record details Export explains', () => {
  const explain = vi.fn();
  const [record] = loadSampleRecords();
  const view = { details: { record, feature: null }, closeDetails: vi.fn(), focusOn: vi.fn() } as unknown as ShowroomView;
  render(<ShowroomDetails view={view} explain={explain} />);
  fireEvent.click(screen.getByRole('button', { name: /Export FASTA/ }));
  expect(explain).toHaveBeenCalledExactlyOnceWith('export');
  expect(view.closeDetails).toHaveBeenCalledOnce();
});

describe('the showroom viewport and search', () => {
  it('Compare is in the viewport toolbar and opens its menu', () => {
    const view = mountShowroom();
    fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));
    expect(screen.getByRole('group', { name: 'Reference comparison' })).toBeTruthy();
    noExplanation();
    view.expectNoSideEffects();
  });

  it('search shows hit marks and the alignment summary, whose Copy explains', () => {
    const view = mountShowroom();
    search('TCTCACAGTGTACGGA');
    const marks = view.container.querySelector('[data-viewer-record="NC_001604"] [data-hit-marks]');
    expect(marks?.getAttribute('data-hit-marks')).toMatch(/^\|+$/);
    const summary = sidebar().querySelector<HTMLElement>('[data-hit-alignment]')!;
    expectExplains(within(summary).getByRole('button', { name: 'Copy' }), 'Copy');
    expect(within(summary).queryByText('Copied')).toBeNull();
    view.expectNoSideEffects();
  });

  it('Local explains and does not switch method', () => {
    const view = mountShowroom();
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Fuzzy' }));
    const local = within(sidebar()).getByRole('button', { name: 'Local' });
    expect((local as HTMLButtonElement).disabled).toBe(false);
    expect(within(sidebar()).queryByText('Local search ready')).toBeNull();
    expectExplains(local, 'Local search');
    expect(local.getAttribute('aria-pressed')).toBe('false');
    expect(within(sidebar()).getByRole('button', { name: 'Whole query' }).getAttribute('aria-pressed')).toBe('true');
    view.expectNoSideEffects();
  });
});
