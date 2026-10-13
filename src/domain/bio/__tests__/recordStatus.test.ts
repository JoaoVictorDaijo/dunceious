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
import { annotationFeatures, isSourceFeature, isUnannotated, isPartial, isEdited, needsAttention, isolateOf } from '../recordStatus';
import { writeDetails } from '../details';
import type { BioFeature, SeqRecord } from '../types';

const source: BioFeature = { type: 'source', name: 'source', start: 0, end: 4, strand: 1 };
const gene: BioFeature = { type: 'gene', name: 'gene', start: 0, end: 3, strand: 1 };
const record = (extra: Partial<SeqRecord> = {}): SeqRecord => ({ id: 'X', name: 'X', sequence: 'ACGT', features: [source, gene], ...extra });

describe('record status', () => {
  it('reuses feature-derived status across unchanged records without rescanning annotations', () => {
    let typeReads = 0;
    let locationReads = 0;
    const feature: BioFeature = { ...gene, get type() { typeReads++; return 'gene'; }, get locationString() { locationReads++; return '1..3'; } };
    const original = record({ features: [source, feature] });
    expect(annotationFeatures(original)).toEqual([feature]);
    expect(isPartial(original)).toBe(false);
    const reads = { typeReads, locationReads };
    expect(isUnannotated(original)).toBe(false);
    expect(annotationFeatures({ ...original, label: 'renamed' })).toEqual([feature]);
    expect(isPartial({ ...original, label: 'renamed' })).toBe(false);
    expect({ typeReads, locationReads }).toEqual(reads);
  });

  it('keeps cached annotations safe from returned-array edits and refreshes replacement features', () => {
    const original = record();
    annotationFeatures(original).pop();
    expect(annotationFeatures(original)).toEqual([gene]);
    expect(isUnannotated(original)).toBe(false);
    expect(isUnannotated({ ...original, features: [source] })).toBe(true);
    expect(isPartial({ ...original, features: [{ ...gene, locationString: '<1..3' }] })).toBe(true);
    expect(isPartial({ ...original, definition: 'partial genome' })).toBe(true);
    expect(isPartial(original)).toBe(false);
  });

  it('excludes source from annotations and unannotated status', () => {
    expect(isSourceFeature(source)).toBe(true);
    expect(isSourceFeature(gene)).toBe(false);
    expect(annotationFeatures(record())).toEqual([gene]);
    expect(isUnannotated(record())).toBe(false);
    expect(isUnannotated(record({ features: [source] }))).toBe(true);
    expect(isUnannotated(record({ features: [] }))).toBe(true);
  });

  it('detects the partial word and feature location markers', () => {
    expect(isPartial(record({ definition: 'virus, partial genome' }))).toBe(true);
    expect(isPartial(record({ features: [{ ...gene, locationString: '<1..200' }] }))).toBe(true);
    expect(isPartial(record({ features: [{ ...gene, locationString: '1..>200' }] }))).toBe(true);
    expect(isPartial(record({ definition: 'impartial genome' }))).toBe(false);
  });

  it('marks edited annotations or changed details as needing attention', () => {
    const clean = record();
    expect(isEdited(clean)).toBe(false);
    expect(needsAttention(clean)).toBe(false);
    expect(isEdited(record({ annotationsEdited: true }))).toBe(true);
    expect(needsAttention(writeDetails(clean, { host: 'camel' }))).toBe(true);
    expect(needsAttention(record({ features: [] }))).toBe(true);
    expect(needsAttention(record({ definition: 'partial genome' }))).toBe(true);
  });

  it('uses isolate, then strain, FASTA header text, then definition', () => {
    const r = record({ definition: 'camel sample', features: [{ ...source, metadata: { isolate: 'K1', strain: 'S1' } }] });
    expect(isolateOf(r)).toBe('K1');
    expect(isolateOf({ ...r, features: [{ ...source, metadata: { strain: 'S1' } }] })).toBe('S1');
    expect(isolateOf({ ...r, features: [] })).toBe('camel sample');
    expect(isolateOf({ ...r, features: [], definition: 'GenBank definition' })).toBe('GenBank definition');
    expect(isolateOf(record({ features: [] }))).toBe('');
  });
});
