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

import { describe, it, expect } from 'vitest';
import { serializeProject, parseProject } from '../projectFile';
import type { SeqRecord } from '@/src/domain/bio/types';

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
