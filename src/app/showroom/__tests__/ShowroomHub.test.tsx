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
import { fireEvent, screen, within } from '@/src/app/testing/renderHarness';
import { explanation, expectExplains, gotIt, mountShowroom, noExplanation, openHub } from './showroomTestKit';

// These tests mount the whole showroom; under parallel CI coverage the heaviest pass Vitest's 5 s default.
vi.setConfig({ testTimeout: 20_000 });

// Every bundled record names its organism, so Export's "Edit details" link never
// shows over the real sample; one test strips the organism from a record to reach it.
const sample = vi.hoisted(() => ({ withoutOrganism: false }));
vi.mock('../sampleWorkspace', async importOriginal => {
  const actual = await importOriginal<typeof import('../sampleWorkspace')>();
  return {
    ...actual,
    loadSampleRecords: () => {
      const records = actual.loadSampleRecords();
      if (!sample.withoutOrganism) return records;
      const stripOrganism = ({ organism: _organism, ...metadata }: Record<string, string>) => metadata;
      return records.map((record, index) => (index === 0
        ? { ...record, features: record.features.map(feature => (feature.type === 'source' ? { ...feature, metadata: stripOrganism(feature.metadata ?? {}) } : feature)) }
        : record));
    },
  };
});

afterEach(() => { sample.withoutOrganism = false; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const nav = () => screen.getByRole('navigation', { name: 'Workbench' });
const exportDialog = () => screen.getByRole('dialog', { name: 'Export sequences' });
const firstButton = (name: RegExp) => screen.getAllByRole('button', { name })[0];

function openExport() {
  fireEvent.click(within(nav()).getByRole('button', { name: 'Export…' }));
  return exportDialog();
}

describe('the showroom Annotation Hub', () => {
  it('the switcher opens the real Hub with its toolbar in the top bar', () => {
    const view = mountShowroom();
    openHub();
    expect(screen.getByRole('button', { name: 'Annotation Hub' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Visual Viewport' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(nav()).getByRole('searchbox', { name: 'Search annotations' })).toBeTruthy();
    expect(within(nav()).getByRole('button', { name: 'Import' })).toBeTruthy();
    expect(within(nav()).getByRole('button', { name: 'Export…' })).toBeTruthy();
    expect(within(nav()).queryByRole('button', { name: 'Pan mode' })).toBeNull();
    expect(within(nav()).queryByRole('button', { name: /^Layers/ })).toBeNull();
    expect(view.container.querySelector('[data-viewer-record]')).toBeNull();
    noExplanation();

    fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
    expect(screen.queryByRole('region', { name: 'Annotation Hub' })).toBeNull();
    expect(within(nav()).getByRole('button', { name: 'Pan mode' })).toBeTruthy();
    expect(view.container.querySelector('[data-viewer-record="NC_045512"]')).not.toBeNull();
    view.expectNoSideEffects();
  });

  it('Hub search, filter and grouping work', () => {
    const view = mountShowroom();
    const hub = openHub();
    const summary = () => hub.querySelector('[data-hub-summary]')!.textContent;
    const before = summary();

    fireEvent.change(within(nav()).getByRole('searchbox', { name: 'Search annotations' }), { target: { value: 'ORF1ab' } });
    const counter = () => nav().querySelector('[data-search-counter]')!.textContent;
    expect(counter()).toMatch(/^0 \/ [1-9]\d*$/);
    fireEvent.click(within(nav()).getByRole('button', { name: 'Next match' }));
    expect(counter()).toMatch(/^1 \/ [1-9]\d*$/);
    expect(summary()).not.toBe(before);
    fireEvent.change(within(nav()).getByRole('searchbox', { name: 'Search annotations' }), { target: { value: '' } });

    const cds = within(hub.querySelector<HTMLElement>('[data-filter-types]')!).getByRole('button', { name: /^CDS/ });
    fireEvent.click(cds);
    expect(cds.getAttribute('aria-pressed')).toBe('true');
    expect(summary()).not.toBe(before);
    fireEvent.click(cds);

    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    const index = screen.getByRole('region', { name: 'Hub index' });
    fireEvent.change(within(index).getByLabelText('Find sequence'), { target: { value: 'OR279985' } });
    expect(within(index).getByRole('button', { name: 'Jump to sequence OR279985' })).toBeTruthy();
    expect(within(index).queryByRole('button', { name: 'Jump to sequence NC_045512' })).toBeNull();
    fireEvent.change(within(index).getByLabelText('Find sequence'), { target: { value: '' } });
    fireEvent.click(within(index).getByRole('button', { name: 'Grouped' }));
    expect(within(index).getByRole('button', { name: 'Grouped' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(hub).getByRole('tab', { name: /^By feature/ }));
    expect(within(hub).getByRole('tab', { name: /^By feature/ }).getAttribute('aria-selected')).toBe('true');
    noExplanation();
    view.expectNoSideEffects();
  });

  it('Focus from the Hub moves to the viewport and the pill returns', () => {
    const view = mountShowroom();
    openHub();
    fireEvent.click(firstButton(/^Open .* on NC_045512 in viewport$/));
    expect(screen.getByRole('button', { name: 'Visual Viewport' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('[data-viewer-record="NC_045512"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Back to Annotation Hub/ }));
    expect(screen.getByRole('region', { name: 'Annotation Hub' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Back to Annotation Hub/ })).toBeNull();
    noExplanation();
    view.expectNoSideEffects();
  });
});

describe('the showroom Hub explains every commit', () => {
  // Split in two only to stay inside the default per-test timeout.
  it('every commit action explains: annotations, removal and Apply', () => {
    const view = mountShowroom();
    const hub = openHub();
    expectExplains(within(hub).getByRole('button', { name: 'Add annotation' }), 'Add annotation');
    expectExplains(firstButton(/^Edit .* on NC_045512$/), 'Edit annotation');
    expectExplains(firstButton(/^Delete .* on NC_045512$/), 'Delete annotations');

    fireEvent.click(screen.getAllByRole('checkbox', { name: /^Select annotation .* on NC_045512$/ })[0]);
    expectExplains(screen.getByRole('button', { name: 'Delete with undo' }), 'Delete annotations');
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select sequence NC_045512' }));
    expectExplains(screen.getByRole('button', { name: 'Remove…' }), 'Remove sequence');
    fireEvent.change(screen.getByLabelText('Detail value'), { target: { value: 'camel' } });
    expectExplains(screen.getByRole('button', { name: 'Apply' }), 'Edit sequence details');
    expect(screen.queryByText(/^Set .* on \d+ sequences/)).toBeNull();
    view.expectNoSideEffects();
  });

  it('every commit action explains: label, details, a file drop and Import', () => {
    const view = mountShowroom();
    const hub = openHub();
    fireEvent.click(screen.getByRole('button', { name: 'Rename NC_045512' }));
    fireEvent.change(screen.getByRole('textbox', { name: /display name/i }), { target: { value: 'Wuhan-Hu-1' } });
    expectExplains(screen.getByRole('button', { name: 'Save name' }), 'Edit sequence details');
    fireEvent.click(firstButton(/^Edit details$/));
    const details = screen.getByRole('form', { name: 'Details for NC_045512' });
    fireEvent.change(within(details).getByLabelText('Host'), { target: { value: 'camel' } });
    fireEvent.submit(details);
    expect(explanation('Edit sequence details')).toBeTruthy();
    gotIt();

    fireEvent.drop(hub, { dataTransfer: { files: [new File(['>a\nACGT\n'], 'more.fasta')] } });
    expect(explanation('Drop files')).toBeTruthy();
    gotIt();

    for (const [item, title] of [['Sequences', 'Drop input batch'], ['Annotations', 'Import annotations'], ['Alignment', 'Upload pre-aligned FASTA'], ['Dunceious project', 'Load project JSON']]) {
      fireEvent.click(within(nav()).getByRole('button', { name: 'Import' }));
      expectExplains(screen.getByRole('menuitem', { name: item }), title);
    }
    view.expectNoSideEffects();
  });

  it("Export's edit details explains", () => {
    sample.withoutOrganism = true;
    const view = mountShowroom();
    openHub();
    const dialog = openExport();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'GenBank' }));
    expectExplains(within(dialog).getByRole('button', { name: 'Edit details' }), 'Edit details');
    expect(screen.queryByRole('form', { name: /^Details for/ })).toBeNull();
    view.expectNoSideEffects();
  });
});

describe('the showroom Export', () => {
  it("Export's final button explains with the file name, format and count", () => {
    const view = mountShowroom();
    openHub();
    const dialog = openExport();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'GenBank' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'File name' }), { target: { value: 'demo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export 4 sequences' }));
    const callout = explanation('Export file');
    expect(callout.textContent).toContain('demo.gb');
    expect(callout.textContent).toContain('GenBank');
    expect(callout.textContent).toContain('4');
    expect(exportDialog()).toBe(dialog);
    expect(within(dialog).getByRole('radio', { name: 'GenBank' }).getAttribute('aria-checked')).toBe('true');
    view.expectNoSideEffects();
  });

  it('export with nothing chosen opens no explanation', () => {
    const view = mountShowroom();
    openHub();
    const dialog = openExport();
    fireEvent.click(within(dialog).getByRole('button', { name: 'None' }));
    const save = within(dialog).getByRole('button', { name: 'Export 0 sequences' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    noExplanation();
    view.expectNoSideEffects();
  });
});
