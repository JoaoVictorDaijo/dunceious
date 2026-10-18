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
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@/src/app/testing/renderHarness';
import type GenomeViewer from '@/src/app/viewer/GenomeViewer';
import { clearAlignConsent } from '@/src/app/logic/alignConsentPref';
import { runInlineSearch } from '@/src/app/logic/runInlineSearch';
import { loadSampleRecords } from '../sampleWorkspace';
import Showroom from '../Showroom';

vi.mock('@/src/app/viewer/GenomeViewer', () => ({
  default: ({ searchResults, currentSearchIdx, activeSelection }: ComponentProps<typeof GenomeViewer>) => <>
    <output aria-label="Viewer hits">{searchResults.length}</output>
    <output aria-label="Viewer current hit">{currentSearchIdx}</output>
    <output aria-label="Viewer selection">{JSON.stringify(activeSelection)}</output>
  </>,
}));

beforeEach(() => {
  clearAlignConsent();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query, matches: query === '(orientation: landscape)', addEventListener: () => {}, removeEventListener: () => {},
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const explanation = (title: string) => screen.getByRole('dialog', { name: title });
const gotIt = () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
const sidebar = () => screen.getByRole('complementary', { name: 'Sidebar' });

function startSession() {
  render(<Showroom onExit={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
}

function searchFor(query: string) {
  fireEvent.change(within(sidebar()).getByPlaceholderText('Enter IUPAC sequence...'), { target: { value: query } });
  fireEvent.click(within(sidebar()).getByRole('button', { name: 'Search' }));
}

function openAlignment() {
  fireEvent.click(within(sidebar()).getByRole('button', { name: 'Align sequences' }));
  return screen.getByRole('dialog', { name: 'Your sequences will leave this browser' });
}

function agreeAndAlign() {
  const consent = openAlignment();
  fireEvent.click(within(consent).getByRole('checkbox'));
  fireEvent.click(within(consent).getByRole('button', { name: 'Continue' }));
  const dialog = screen.getByRole('dialog', { name: 'Align with EMBL-EBI' });
  expect((within(dialog).getByLabelText('Email') as HTMLInputElement).value).toBe('you@example.org');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Align' }));
}

describe('Showroom search', () => {
  it('searches the samples and highlights the hits in the viewer', () => {
    startSession();
    searchFor('ACGAAC');
    const expected = runInlineSearch({
      searchQuery: 'ACGAAC', mode: 'exact', options: { minIdentity: 80, strand: 'both', maxResults: 100 }, moleculeType: 'dna',
      records: loadSampleRecords().map(({ id, sequence, alignedSequence, moleculeType }) => ({ id, sequence, alignedSequence, moleculeType })),
    });
    expect(screen.getByLabelText('Viewer hits').textContent).toBe(String(expected.length));
    expect(screen.getByLabelText('Viewer current hit').textContent).toBe('0');
    expect(JSON.parse(screen.getByLabelText('Viewer selection').textContent!)).toEqual({ start: expected[0].start, end: expected[0].end, recordIds: [expected[0].recordId] });
  });

  it('explains annotating and joining matches', () => {
    startSession();
    searchFor('ACGAAC');
    fireEvent.click(within(sidebar()).getAllByRole('button', { name: /^Annotate match/ })[0]);
    expect(explanation('Annotate match')).toBeTruthy();
    gotIt();
    fireEvent.click(within(sidebar()).getAllByRole('button', { name: 'Join all' })[0]);
    expect(explanation('Join matches')).toBeTruthy();
    gotIt();
    fireEvent.click(within(sidebar()).getAllByRole('button', { name: 'Select all' })[0]);
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Join selected' }));
    expect(explanation('Join matches')).toBeTruthy();
  });

  it('keeps the sidebar sections in the workbench order', () => {
    startSession();
    expect(within(sidebar()).getAllByRole('heading').map(heading => heading.textContent))
      .toEqual(['Record Navigator', 'Navigation', 'Ingestion', 'Alignment', 'Sequence Search']);
  });
});

describe('Showroom alignment', () => {
  it('opens the real dialog under the test-drive banner and explains Align', () => {
    startSession();
    const consent = openAlignment();
    expect(screen.getByText('Test drive: nothing will be sent')).toBeTruthy();
    expect(within(consent).getByText(/10 sequences/)).toBeTruthy();
    agreeAndAlign();
    expect(explanation('Align')).toBeTruthy();
    gotIt();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Align with EMBL-EBI' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Test drive: nothing will be sent')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['EMBL-EBI privacy notice', 'Terms of use'])('external links never navigate: %s', name => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    startSession();
    const link = within(openAlignment()).getByRole('link', { name });
    // Enter on a focused link reaches the page as a click, so `click` covers keyboard activation.
    for (const type of ['click', 'auxclick', 'contextmenu', 'dragstart']) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'auxclick' ? 1 : 0 });
      expect(fireEvent(link, event)).toBe(false);
      expect(explanation('Link to another website')).toBeTruthy();
      gotIt();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it('sends nothing, stores nothing and copies nothing across a session', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    startSession();
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Hide NC_012920 in viewport' }));
    searchFor('ACGAAC');
    fireEvent.click(within(sidebar()).getAllByRole('button', { name: /^Annotate match/ })[0]);
    gotIt();
    agreeAndAlign();
    gotIt();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Align with EMBL-EBI' })).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project and options' }));
    gotIt();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
