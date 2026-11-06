/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { describe, it, expect } from 'vitest';
import { serializeProject, parseProject } from '../projectFile';
import type { SeqRecord } from '@/src/domain/bio/types';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { exportToGff3 } from '@/src/core/formats/gff3';

const record: SeqRecord = { id: 'local_1', name: 'local_1', sequence: 'ACGT', alignedSequence: 'A--CGT',
  label: 'camel isolate', accession: 'X', version: 'X.2', importedFrom: 'camel.gb', locationQualifier: 'country',
  fileDetails: { host: 'camel', collectionDate: '2014' }, fastaModifiers: { strain: 'K1', custom: 'kept' }, annotationsEdited: true,
  features: [{ type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { host: 'human', collection_date: 'March 2014', country: 'Oman' } }],
  tracks: [{ id: 'track', name: 'score', data: [{ start: 0, end: 4, value: 2 }] }], visible: false };
const state = { name: 'Project', records: [record], featureColors: { gene: '#123456' },
  activeSelection: { start: 0, end: 4, recordIds: ['local_1'] },
  showAnnotations: false, showTranslation: true, showConservation: false, version: '2.8.0' };

describe('project format 2', () => {
  it('round-trips every field including invalid edited details without sanitizing values', () => {
    const text = serializeProject(state);
    expect(JSON.parse(text).format).toBe(2);
    const result = parseProject(text);
    expect(result).toEqual({ ok: true, project: { ...state, format: 2 } });
    expect(state.records[0].features[0].metadata?.collection_date).toBe('March 2014');
  });
  it.each([undefined, 1, '2', 3])('rejects unsupported or absent format %s with the explicit earlier-version message', format => {
    expect(parseProject(JSON.stringify({ ...state, format }))).toEqual({ ok: false,
      message: "This project was saved by an earlier version of Dunceious and can't be opened." });
  });
  it('returns a clear failure for malformed JSON', () => {
    expect(parseProject('{broken')).toEqual({ ok: false, message: 'This project file is not valid JSON.' });
  });
  it.each([{ ...state, records: {} }, { ...state, records: [{}] }, { ...state, featureColors: null }, { ...state, showAnnotations: 'yes' }])('refuses malformed format 2 data without returning a partial project', invalid => {
    expect(parseProject(JSON.stringify({ ...invalid, format: 2 }))).toEqual({ ok: false, message: 'This project file contains invalid workspace data.' });
  });
  it.each([
    ['TTTT', 'This project file contains an alignment whose residues differ from sequence local_1.'],
    ['A--CG', 'This project file contains an alignment whose residues differ from sequence local_1.'],
    ['A.-CGT', 'This project file contains an alignment with "." gaps in local_1; only "-" is supported.'],
  ])('refuses a saved alignment %s that is not the record residues with "-" gaps (#249)', (alignedSequence, message) => {
    const text = serializeProject({ ...state, records: [{ ...record, alignedSequence }] });
    expect(parseProject(text)).toEqual({ ok: false, message });
  });
});


it.each([
  { features: [{ type: 'gene', name: 'g', start: 0, end: 4, strand: 1, locationString: {} }] },
  { features: [{ type: 'gene', name: 'g', start: 0, end: 4, strand: 1, translation: 42 }] },
  { features: [{ type: 'gene', name: 'g', start: 0, end: 4, strand: 1, color: {} }] },
  { features: [{ type: 'gene', name: 'g', start: 0, end: 4, strand: 1, segments: [{ start: 0, end: 4, strand: 'reverse' }] }] },
  { tracks: [{ id: 't', name: 't', kind: 'invalid', data: [] }] },
  { tracks: [{ id: 't', name: 't', color: {}, data: [] }] },
  { metadata: [] },
])('rejects malformed optional record fields %j', invalid => {
  expect(parseProject(JSON.stringify({ ...state, format: 2, records: [{ ...record, ...invalid }] })))
    .toEqual({ ok: false, message: 'This project file contains invalid workspace data.' });
});

it.each([{ selectionRange: { start: '0', end: 4 } }, { exportedAt: {} }])('rejects malformed optional project fields %j', invalid => {
  expect(parseProject(JSON.stringify({ ...state, format: 2, ...invalid })))
    .toEqual({ ok: false, message: 'This project file contains invalid workspace data.' });
});


it.each(['local_1', 'LOCAL_1'])('rejects duplicate workspace ID %s without a partial project', id => {
  const result = parseProject(serializeProject({ ...state, records: [record, { ...record, id }] }));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toMatch(/duplicate.*record ID/i);
});

it.each(['a\n>b', '', 'my sequence', 'seq\t1', 'seq\r1', 'seq;1', 'seq=1', 'seq&1',
  'seq,1', 'seq%1', 'seq[1]', 'seq(1)', 'seq"1', "seq'1", '_seq', 'seq_', 'seq__1'])('rejects project workspace ID %j outside the workspace ID contract', id => {
  const project = { ...state, records: [{ ...record, id }],
    activeSelection: { start: 0, end: 4, recordIds: [id] } };
  expect(parseProject(serializeProject(project)))
    .toEqual({ ok: false, message: 'This project file contains invalid workspace data.' });
});

it.each(['local_1', 'NC_001.2:ref-3', 'Seq|1+2/3'])('preserves safe workspace ID %s and selection references', id => {
  const project = { ...state, records: [{ ...record, id }],
    activeSelection: { start: 0, end: 4, recordIds: [id] } };
  expect(parseProject(serializeProject(project))).toEqual({ ok: true, project: { ...project, format: 2 } });
});

it('keeps search provenance through project save and load', () => {
  const provenance = { v: 1, query: 'AC', mode: 'whole', alphabet: 'nucleotide', params: {}, strand: 1, cigar: '2=', span: { start: 0, end: 2, strand: 1 }, appVersion: '3.4.0', createdAt: '2026-10-16', exportNote: false };
  const raw = JSON.stringify(provenance);
  const saved = serializeProject({ records: [{ id: 'hit', name: 'hit', sequence: 'AC', features: [{ name: 'hit', type: 'misc_feature', start: 0, end: 2, strand: 1, metadata: { _searchHit: raw } }] }], featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false });
  const loaded = parseProject(saved);
  expect(loaded.ok).toBe(true);
  if (loaded.ok) expect(loaded.project.records[0].features[0].metadata?._searchHit).toBe(raw);
});

it.each([
  [{}, 'fuzzy search (whole query)'],
  [{ minQueryIdentity: 75 }, 'fuzzy search (whole query, min query identity 75%)'],
])('exports only the threshold that loaded search provenance %o records', (params, method) => {
  const provenance = { v: 1, query: 'AAA', mode: 'whole', alphabet: 'nucleotide', params, strand: 1, cigar: '3=', edits: 0,
    span: { start: 0, end: 3, strand: 1 }, appVersion: '3.7.3', createdAt: '2026-10-16', exportNote: true };
  const saved = serializeProject({ records: [{ id: 'hit', name: 'hit', sequence: 'AAA', features: [{ name: 'hit', type: 'misc_feature', start: 0, end: 3, strand: 1, metadata: { _searchHit: JSON.stringify(provenance) } }] }], featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false });
  const loaded = parseProject(saved);
  if (!loaded.ok) throw new Error(loaded.message);
  const note = `Found by Dunceious ${method}: query AAA (3 nt), 100% query identity, 0 edits, CIGAR 3=`;
  const gb = exportToGenBank(loaded.project.records).text.replace(/\n {21}/g, ' ');
  const gff = decodeURIComponent(exportToGff3(loaded.project.records).text);
  expect(gb).toContain(`/note="${note}"`);
  expect(gff).toContain(`Note=${note}`);
  if (!('minQueryIdentity' in params)) expect(gb + gff).not.toMatch(/min query identity/);
});

it('refuses partly stranded pieces naming the feature, retains invalid geometry, and strips derived geometry', () => {
  const feature = { type: 'gene', name: 'damaged', start: 8, end: 2, strand: 1 as const,
    segments: [{ start: 8, end: 2 }, { start: 3, end: 5, strand: 1 as const }], biological: { start: 0, end: 1, strand: 1 as const } };
  expect(parseProject(serializeProject({ ...state, records: [{ ...record, features: [feature] }] })))
    .toEqual({ ok: false, message: 'Feature damaged has a strand on some of its pieces but not others.' });
  const invalid = { ...feature, segments: [] };
  const loaded = parseProject(JSON.stringify({ ...state, format: 2, records: [{ ...record, features: [invalid] }] }));
  expect(loaded.ok).toBe(true);
  if (loaded.ok) {
    expect(loaded.project.records[0].features[0]).toMatchObject({ start: 8, end: 2 });
    expect(loaded.project.records[0].features[0]).not.toHaveProperty('biological');
  }
  expect(JSON.parse(serializeProject({ ...state, records: [{ ...record, features: [invalid] }] })).records[0].features[0]).not.toHaveProperty('biological');
});

// Projects saved before features carried `operator` and `betweenBases` hold order() and n^n+1 only
// in locationString, which the first edit clears. Loading reads both from that text (INSDC FT 11.4
// §3.4.2.1-2), so an edit cannot turn order() into join() or keep a site two bases wide.
describe('project locations saved before operators and sites', () => {
  const load = (feature: Record<string, unknown>, extra: Partial<SeqRecord> = {}) => {
    const legacy = { ...record, sequence: 'A'.repeat(30), alignedSequence: undefined, ...extra,
      features: [{ type: 'misc_feature', name: 'f', strand: 1, ...feature } as never] };
    const result = parseProject(serializeProject({ ...state, records: [legacy] }));
    if (!result.ok) throw new Error(result.message);
    return result.project.records[0].features[0];
  };

  it('reads the operator of an order() feature from its location text', () => {
    expect(load({ start: 0, end: 13, segments: [{ start: 0, end: 3 }, { start: 10, end: 13 }], locationString: 'order(1..3,11..13)' }).operator).toBe('order');
  });

  it('re-reads a site saved with the two-base geometry as zero bases', () => {
    expect(load({ start: 9, end: 11, segments: [{ start: 9, end: 11 }], locationString: '10^11' }))
      .toMatchObject({ start: 10, end: 10, segments: [{ start: 10, end: 10 }], betweenBases: true });
  });

  it('leaves a site that does not fit its record as saved', () => {
    expect(load({ start: 29, end: 1, locationString: '30^1' })).toMatchObject({ start: 29, end: 1 });
  });

  it.each([{ operator: 'splice' }, { betweenBases: 'yes' }])('refuses the invalid location field %o', field => {
    const result = parseProject(serializeProject({ ...state, records: [{ ...record,
      features: [{ type: 'misc_feature', name: 'f', strand: 1, start: 0, end: 1, ...field } as never] }] }));
    expect(result.ok).toBe(false);
  });
});

// LOC-4 for projects saved before the partial flags existed: the text still holds < and >, and the
// stored segments are the ones that text was read as, so the flags are copied onto them.
describe('project partial ends saved before the flags', () => {
  const load = (feature: Record<string, unknown>) => {
    const legacy = { ...record, sequence: 'A'.repeat(30), alignedSequence: undefined,
      features: [{ type: 'CDS', name: 'c', strand: 1, ...feature } as never] };
    const result = parseProject(serializeProject({ ...state, records: [legacy] }));
    if (!result.ok) throw new Error(result.message);
    return result.project.records[0].features[0];
  };

  it('reads the markers of <1..20 from its text', () => {
    expect(load({ start: 0, end: 20, segments: [{ start: 0, end: 20 }], locationString: '<1..20' }).segments)
      .toEqual([{ start: 0, end: 20, partialStart: true }]);
  });

  it('leaves segments alone when they no longer match the text', () => {
    expect(load({ start: 0, end: 15, segments: [{ start: 0, end: 15 }], locationString: '<1..20' }).segments)
      .toEqual([{ start: 0, end: 15 }]);
  });
});

// #241 for projects saved before writtenOrder: the nested text gives the written order of the
// stored (evaluation-order) segments, so a later edit keeps the linear envelope.
describe('project written order saved before the field', () => {
  it('reads the written order of a nested complement from its text', () => {
    const legacy = { ...record, sequence: 'A'.repeat(30), alignedSequence: undefined, features: [{ type: 'misc_feature', name: 'n', strand: 1,
      start: 0, end: 12, segments: [{ start: 9, end: 12, strand: -1 }, { start: 0, end: 3, strand: 1 }],
      locationString: 'complement(join(complement(1..3),10..12))' } as never] };
    const result = parseProject(serializeProject({ ...state, records: [legacy] }));
    if (!result.ok) throw new Error(result.message);
    expect(result.project.records[0].features[0].writtenOrder).toEqual([1, 0]);
  });
});

// #245 for projects saved before remoteParts: the remote interval was stored as local bases, so the
// feature is re-read from its text and the other entry's coordinates leave the local segments.
describe('project remote parts saved before the field', () => {
  it('moves J00194.1:100..202 out of the local segments', () => {
    const legacy = { ...record, sequence: 'A'.repeat(300), alignedSequence: undefined, features: [{ type: 'CDS', name: 'r', strand: 1,
      start: 0, end: 202, segments: [{ start: 0, end: 100 }, { start: 99, end: 202 }],
      locationString: 'join(1..100,J00194.1:100..202)' } as never] };
    const result = parseProject(serializeProject({ ...state, records: [legacy] }));
    if (!result.ok) throw new Error(result.message);
    expect(result.project.records[0].features[0]).toMatchObject({ segments: [{ start: 0, end: 100 }], start: 0, end: 100,
      remoteParts: [{ accession: 'J00194.1', start: 99, end: 202, strand: 1, index: 1 }] });
  });
});

it.each([
  { private_note: { toString: 'not callable' } },
  { private_note: [] },
  { private_note: 42 },
  { private_note: false },
  { private_note: null },
  [],
  'not a map',
  null,
])('refuses malformed inert qualifier data at the project boundary: %j', unknownQualifiers => {
  const project = { ...state, records: [{ ...record, features: [{ ...record.features[0], unknownQualifiers }] }] };
  expect(parseProject(JSON.stringify({ ...project, format: 2 }))).toEqual({ ok: false, message: 'This project file contains invalid workspace data.' });
});

it('preserves own inert string keys including prototype-shaped names through a project round trip', () => {
  const unknownQualifiers = JSON.parse('{"__proto__":"literal prototype","constructor":"literal constructor","phase":"1"}');
  const project = { ...state, records: [{ ...record, features: [{ ...record.features[0], unknownQualifiers }] }] };
  const restored = parseProject(serializeProject(project));
  expect(restored).toEqual({ ok: true, project: { ...project, format: 2 } });
  if (!restored.ok) throw new Error(restored.message);
  const inert = restored.project.records[0].features[0].unknownQualifiers!;
  expect(Object.keys(inert).sort()).toEqual(['__proto__', 'constructor', 'phase']);
  expect(inert.__proto__).toBe('literal prototype');
  expect(inert.constructor).toBe('literal constructor');
});

it('refuses damaged residues and unequal alignment widths, and accepts valid alignment', () => {
  expect(parseProject(serializeProject({ ...state, records: [{ ...record, sequence: 'AC-GT' }] }))).toEqual({ ok: false,
    message: 'This project file contains gap characters in the sequence of local_1; the file is damaged' });
  expect(parseProject(serializeProject({ ...state, records: [{ ...record, alignedSequence: 'AC--GT' },
    { ...record, id: 'b', sequence: 'ACTTGT', alignedSequence: 'ACTTGT--' }] }))).toEqual({ ok: false,
    message: 'This project file contains an alignment whose rows have different lengths' });
  expect(parseProject(serializeProject(state)).ok).toBe(true);
});

// Codex review of #306, round 3: a saved location the parser cannot read (here the obsolete 2.3)
// leaves the feature as saved instead of failing the whole project load.
it('loads a project whose saved location text cannot be parsed, keeping the feature as saved', () => {
  const legacy = { ...record, sequence: 'ACGT', alignedSequence: undefined,
    features: [{ type: 'misc_feature', name: 'f', strand: 1, start: 1, end: 2, segments: [{ start: 1, end: 2 }], locationString: '2.3' } as never] };
  const result = parseProject(serializeProject({ ...state, records: [legacy] }));
  expect(result.ok && result.project.records[0].features[0]).toMatchObject({ start: 1, end: 2, segments: [{ start: 1, end: 2 }], locationString: '2.3' });
});
