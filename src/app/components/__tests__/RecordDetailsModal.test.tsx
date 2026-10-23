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
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, act } from '@/src/app/testing/renderHarness';
import RecordDetailsModal from '../RecordDetailsModal';
import { UiEffectsContext, DEFAULT_UI_EFFECTS } from '../uiEffects';
import { parseGenBank } from '@/src/core/genbank';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';

const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;
const caption = () => document.querySelector('[data-sequence-caption]')?.textContent;
const lengths = () => document.querySelector('[data-feature-lengths]')?.textContent?.replace(/^Length/, '').replace(/\s+/g, ' ').replace(/ (?=\d+ (bp|aa) region)/, '');

describe('RecordDetailsModal biological coordinates', () => {
  it('names both lengths and focuses every aligned part', () => {
    const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGTACGT', alignedSequence: '--A-CG--TA-C--GT--',
      features: [{ type: 'gene', name: 'joined', start: 0, end: 8, strand: 1,
        segments: [{ start: 0, end: 3 }, { start: 4, end: 8 }] }] };
    const onFocusFeature = vi.fn();
    render(<RecordDetailsModal record={record} feature={record.features[0]} onClose={() => {}}
      onFocusFeature={onFocusFeature} onExportRecord={() => {}} onCopyLog={() => {}} />);
    expect(lengths()).toBe('7 bp feature sequence · sum of 2 location intervals8 bp region spanned · 1..8');
    fireEvent.click(screen.getByText(/Focus/));
    expect(onFocusFeature).toHaveBeenCalledWith({ recordId: 'r', featureIndex: 0, start: 2, end: 16, label: 'joined', length: 7 });
  });
});

it('offers query bases only for a hit, shows staleness and removes search details', () => {
  const provenance = { v: 1, query: 'AC', mode: 'whole', alphabet: 'nucleotide', params: {}, strand: 1, cigar: '2=', span: { start: 0, end: 2, strand: 1 }, appVersion: '3.4.0', createdAt: '2026-10-16', exportNote: false };
  const feature = { name: 'hit', type: 'misc_feature', start: 0, end: 3, strand: 1 as const, metadata: { _searchHit: JSON.stringify(provenance) } };
  const remove = vi.fn(); const mode = vi.fn();
  render(<RecordDetailsModal record={{ id: 'r', name: 'r', sequence: 'ACG', features: [feature] }} feature={feature}
    onClose={vi.fn()} onFocusFeature={vi.fn()} onExportRecord={vi.fn()} onCopyLog={vi.fn()} onSetBasesMode={mode} onRemoveSearchDetails={remove} />);
  expect(screen.getByText("The search alignment no longer matches this annotation's region.")).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Query aligned to record' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove search details' }));
  expect(remove).toHaveBeenCalledOnce();
});
it('keeps joined annotations on record bases only', () => {
  const feature = { name: 'joined', type: 'misc_feature', start: 0, end: 3, strand: 1 as const, segments: [{ start: 0, end: 1 }, { start: 2, end: 3 }] };
  render(<RecordDetailsModal record={{ id: 'r', name: 'r', sequence: 'ACG', features: [feature] }} feature={feature}
    onClose={vi.fn()} onFocusFeature={vi.fn()} onExportRecord={vi.fn()} onCopyLog={vi.fn()} onSetBasesMode={vi.fn()} />);
  expect(screen.queryByRole('option', { name: 'Query aligned to record' })).toBeNull();
  expect(screen.getByText("The query layer isn't available for joined annotations.")).toBeTruthy();
});

// Expected sequences come from docs/standards/conformance/expected-oracle.txt (INSDC rules by hand).
const dir = 'docs/standards/conformance';
const [fixture] = parseGenBank(readFileSync(`${dir}/fixture.gb`, 'utf8'));
const oracle = Object.fromEntries(readFileSync(`${dir}/expected-oracle.txt`, 'utf8').trim().split('\n')
  .map(line => line.split('\t') as [string, string]));
const labelled = (label: string) => fixture.features.find(f => f.metadata?.label === label)!;

function open(record: SeqRecord, feature: BioFeature) {
  const copyText = vi.fn().mockResolvedValue(true);
  const onCopyLog = vi.fn();
  render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, copyText }}>
    <RecordDetailsModal record={record} feature={feature} onClose={vi.fn()} onFocusFeature={vi.fn()}
      onExportRecord={vi.fn()} onCopyLog={onCopyLog} />
  </UiEffectsContext.Provider>);
  const sequence = () => document.querySelector('[data-record-details-body] p.break-all')?.textContent?.toUpperCase();
  return { copyText, onCopyLog, sequence };
}

describe('RecordDetailsModal sequence views', () => {
  it('opens a complement(join) feature on its feature sequence and switches to the region', async () => {
    const { copyText, onCopyLog, sequence } = open(fixture, labelled('J2'));
    expect(radio('Feature sequence').checked).toBe(true);
    expect(sequence()).toBe(oracle.J2);
    expect(lengths()).toBe('20 bp feature sequence · sum of 2 location intervals30 bp region spanned · 1..30');
    expect(screen.getByText('20 bp feature sequence')).toBeTruthy();
    expect(screen.getByText(/then reverse-complemented because the location is complement\(…\)\. Read 5′ → 3′ on the reverse \(−\) strand\./)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy feature sequence \(20 bp\)/ })); });
    expect(copyText.mock.calls[0][0].toUpperCase()).toBe(oracle.J2);
    expect(onCopyLog).toHaveBeenLastCalledWith('Feature sequence for J2 in TESTSEQ copied to clipboard.');

    fireEvent.click(screen.getByRole('radio', { name: 'Region spanned' }));
    expect(sequence()).toBe('TGTTACCTAGGGCGCACGCGCTCTCTATGG');
    expect(screen.getByText('30 bp region')).toBeTruthy();
    expect(screen.getByText(/Record bases 1\.\.30, forward \(\+\) strand, 5′ → 3′, including the bases between the 2 intervals\./)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy region \(30 bp\)/ })); });
    expect(copyText.mock.calls[1][0].toUpperCase()).toBe('TGTTACCTAGGGCGCACGCGCTCTCTATGG');
    expect(onCopyLog).toHaveBeenLastCalledWith('Region for J2 in TESTSEQ copied to clipboard.');
  });

  it('orients each interval of a mixed-strand join on its own', () => {
    const { sequence } = open(fixture, labelled('J3'));
    expect(sequence()).toBe(oracle.J3);
    expect(screen.getByText(/each read 5′ → 3′ on its own strand/)).toBeTruthy();
  });

  it('joins an origin-crossing feature and shows its region across the origin', () => {
    const { sequence } = open(fixture, labelled('W1'));
    expect(sequence()).toBe(oracle.W1);
    expect(lengths()).toBe('11 bp feature sequence · sum of 2 location intervals11 bp region spanned · 115..5');
  });

  it('offers only the region for an order() location', () => {
    const { sequence } = open(fixture, labelled('O1'));
    const feature = screen.getByRole('radio', { name: 'Feature sequence' });
    expect(feature.hasAttribute('disabled')).toBe(true);
    expect(radio('Region spanned').checked).toBe(true);
    expect(sequence()).toBe('TGTTACCTAGGGC');
    expect(lengths()).toBe('6 bp in 2 intervals (not joined)13 bp region spanned · 1..13');
    expect(caption()).toMatch(/^order\(\) location: INSDC gives the order of these 2 intervals but does not imply they form one sequence/);
    expect(screen.getByText('order() location:').className).toContain('text-amber-700');
    expect(screen.getByRole('button', { name: /Copy region \(13 bp\)/ })).toBeTruthy();
  });

  it('flags a partial location next to its length and in the caption', () => {
    const { sequence } = open(fixture, labelled('P1'));
    expect(sequence()).toBe(oracle.P1.split(' ')[0]);
    expect(lengths()).toBe('21 bp Partial feature sequence · 1 location interval21 bp region spanned · 5..25');
    expect(caption()).toBe('Sequence defined by the location: bases 5..25. Read 5′ → 3′ on the forward (+) strand. Partial: at least one end lies beyond the annotated base (< or >), so this sequence is incomplete.');
    expect(screen.queryByText('Partial', { selector: '[data-record-details-body] span' })).toBeTruthy();
  });

  it('reverse-complements a single-interval reverse CDS and names it the coding sequence', () => {
    // complement(2..7) on AATGCCCA: bases ATGCCC, reverse complement GGGCAT.
    const feature: BioFeature = { type: 'CDS', name: 'orf', start: 1, end: 7, strand: -1, locationString: 'complement(2..7)' };
    const { sequence } = open({ id: 'r', name: 'r', sequence: 'AATGCCCA', features: [feature] }, feature);
    expect(sequence()).toBe('GGGCAT');
    expect(caption()).toBe('Sequence defined by the location: bases 2..7, reverse-complemented because the location is complement(…). Read 5′ → 3′ on the reverse (−) strand. For a CDS this is the coding sequence.');
  });

  it('uses residues and no strand for a protein record', () => {
    const feature: BioFeature = { type: 'Region', name: 'dom', start: 1, end: 8, strand: 1, segments: [{ start: 1, end: 3 }, { start: 5, end: 8 }] };
    const { sequence } = open({ id: 'p', name: 'p', sequence: 'MKVLATGQW', moleculeType: 'protein', features: [feature] }, feature);
    expect(sequence()).toBe('KVTGQ');
    expect(lengths()).toBe('5 aa feature sequence · sum of 2 location intervals7 aa region spanned · 2..8');
    expect(screen.getByText('Sequence defined by the location: the 2 intervals joined in the order written.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Region spanned' }));
    expect(screen.getByText('Record residues 2..8, including the residues between the 2 intervals.')).toBeTruthy();
  });

  it('gives a reverse search hit the same views and keeps its search controls', () => {
    const provenance = { v: 1, query: 'GGGC', mode: 'whole', alphabet: 'nucleotide', params: {}, strand: -1, cigar: '4=', span: { start: 2, end: 6, strand: -1 }, appVersion: '3.7.3', createdAt: '2026-10-23', exportNote: false };
    const feature: BioFeature = { name: 'hit', type: 'misc_feature', start: 2, end: 6, strand: -1, metadata: { _searchHit: JSON.stringify(provenance) } };
    const record: SeqRecord = { id: 'r', name: 'r', sequence: 'AAGCCCTT', features: [feature] };
    render(<RecordDetailsModal record={record} feature={feature} onClose={vi.fn()} onFocusFeature={vi.fn()}
      onExportRecord={vi.fn()} onCopyLog={vi.fn()} onSetBasesMode={vi.fn()} onRemoveSearchDetails={vi.fn()} />);
    // Record bases 3..6 are GCCC; on the reverse strand they read GGGC, the query.
    expect(document.querySelector('[data-record-details-body] p.break-all')?.textContent).toBe('GGGC');
    expect(screen.getByRole('option', { name: 'Query aligned to record' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Remove search details' })).toBeTruthy();
  });

});

describe('RecordDetailsModal edge captions and controls', () => {
  it('groups the native view radios under one accessible selection', () => {
    open(fixture, labelled('J1'));
    const [feature, region] = [radio('Feature sequence'), radio('Region spanned')];
    expect(feature.type).toBe('radio');
    expect(feature.name).toBeTruthy();
    expect(region.name).toBe(feature.name);
  });

  it('keeps the partial explanation in the region view', () => {
    open(fixture, labelled('P1'));
    fireEvent.click(radio('Region spanned'));
    expect(caption()).toBe('Record bases 5..25, forward (+) strand, 5′ → 3′. Partial: at least one end lies beyond the annotated base (< or >), so this sequence is incomplete.');
  });

  it('keeps the partial explanation for a partial order() location', () => {
    const feature: BioFeature = { type: 'misc_feature', name: 'po', start: 0, end: 13, strand: 1,
      segments: [{ start: 0, end: 3 }, { start: 10, end: 13 }], locationString: 'order(<1..3,11..>13)' };
    open(fixture, feature);
    expect(caption()).toMatch(/only the region spanned is shown\. Record bases 1\.\.13, .* Partial: at least one end lies beyond the annotated base/);
  });

  it('does not call a feature without a strand forward', () => {
    const feature: BioFeature = { type: 'gene', name: 'g', start: 1, end: 5, strand: 1, metadata: { _gffStrand: '?' } };
    open({ id: 'r', name: 'r', sequence: 'AACCGGTT', features: [feature] }, feature);
    expect(caption()).toBe('Sequence defined by the location: bases 2..5. The feature gives no strand, so its bases read 5′ → 3′ as the record is written.');
  });

  it('names a zero-length location as a site between two bases', () => {
    // start 2, end 2 (0-based, half-open) is the site between bases 2 and 3: INSDC 2^3.
    const feature: BioFeature = { type: 'misc_feature', name: 'site', start: 2, end: 2, strand: 1 };
    open({ id: 'r', name: 'r', sequence: 'ACGT', features: [feature] }, feature);
    expect(lengths()).toBe('0 bp feature sequence · 1 location interval0 bp region spanned · 2^3');
    expect(caption()).toBe('Zero-length site 2^3: the location covers no bases.');
  });
});

describe('RecordDetailsModal nested complement sequence views', () => {
  it.each(['J4', 'J5'])('%s: copies the nested feature sequence and switches to its forward region', async label => {
    const { sequence, copyText } = open(fixture, labelled(label));
    expect(sequence()).toBe(oracle[label]);
    expect(lengths()).toBe('4 bp feature sequence · sum of 2 location intervals6 bp region spanned · 1..6');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy feature sequence \(4 bp\)/ })); });
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText.mock.calls[0][0].toUpperCase()).toBe(oracle[label]);
    fireEvent.click(radio('Region spanned'));
    expect(sequence()).toBe('TGTTAC');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy region \(6 bp\)/ })); });
    expect(copyText.mock.calls[1][0].toUpperCase()).toBe('TGTTAC');
  });

});
