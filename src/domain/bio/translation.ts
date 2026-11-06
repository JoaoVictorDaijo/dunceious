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


import type { BioFeature, SeqRecord, ConceptualTranslation } from './types';
export type { ConceptualTranslation } from './types';
import { NCBI_GENETIC_CODES } from './geneticCodes';
import { extractCodingSequence, featureTranslTable, initiatorResidue, isNcbiGeneticCode } from './sequence';
import { definesOneSequence, isFivePrimePartialLocation, isThreePrimePartialLocation } from './locationFlags';
import { getFeatureStrand } from './strand';


export const isCds = (feature: Pick<BioFeature, 'type'>): boolean => ['CDS', 'cds', 'SO:0000316'].includes(feature.type);
export const storedTranslation = (feature: { metadata?: Record<string, unknown> }): string | undefined =>
  typeof feature.metadata?.translation === 'string' ? feature.metadata.translation.replace(/\s/g, '') || undefined : undefined;

const bases: Record<string, string> = { A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
function expansions(codon: string): string[] {
  let result = [''];
  for (const base of codon) result = result.flatMap(prefix => [...(bases[base] ?? 'ACGT')].map(b => prefix + b));
  return result;
}
function reading(set: string): string {
  if (set.length === 1) return set;
  return ({ DN: 'B', EQ: 'Z', IL: 'J' } as Record<string, string>)[set] ?? 'X';
}

/** Contextual NCBI CDS product, independent of every stored protein assertion. */
export function conceptualTranslation(feature: BioFeature, record: Pick<SeqRecord, 'sequence' | 'moleculeType'>): ConceptualTranslation {
  const unavailable = (reason: Extract<ConceptualTranslation, { status: 'unavailable' }>['reason']): ConceptualTranslation => ({ status: 'unavailable', reason });
  if (record.moleculeType === 'protein') return unavailable('protein-record');
  const table = featureTranslTable(feature);
  if (!isNcbiGeneticCode(table)) return unavailable('invalid-code');
  if (feature.metadata?.transl_except !== undefined) return unavailable('unsupported-exception');
  const strand = getFeatureStrand(feature);
  if (strand !== 1 && strand !== -1) return unavailable('unknown-strand');
  if (!definesOneSequence(feature)) return unavailable('nonlocal-location');
  if (!feature.segments?.length || feature.segments.some(s => !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end < s.start || s.end > record.sequence.length)) return unavailable('unknown-completeness');
  const resolved = resolvedTranslationFeature(feature);
  const { codingSeq, alignedIndices } = extractCodingSequence(resolved, record.sequence);
  if (!codingSeq) return unavailable('empty');
  const seq = codingSeq.toUpperCase().replace(/U/g, 'T');
  const code = NCBI_GENETIC_CODES[table];
  const possible: string[] = [];
  const residues: string[] = [];
  const full = Math.floor(seq.length / 3);
  const index = (codon: string) => [...codon].reduce((n, b) => n * 4 + 'TCAG'.indexOf(b), 0);
  const readings = (codon: string, terminal: boolean) => [...new Set(expansions(codon).map(c => {
    const i = index(c);
    return terminal && code.starts[i] === '*' ? '*' : code.aminoAcids[i];
  }))].sort().join('');
  for (let i = 0; i < full; i++) {
    const codon = seq.slice(i * 3, i * 3 + 3);
    let set = readings(codon, i === full - 1 && seq.length % 3 === 0 && !isThreePrimePartialLocation(resolved));
    if (i === 0 && !isFivePrimePartialLocation(resolved) && Number(feature.metadata?.codon_start ?? 1) === 1 && initiatorResidue(codon, table)) set = 'M';
    possible.push(set); residues.push(reading(set));
  }
  if (seq.length % 3) {
    const set = readings(seq.slice(full * 3).padEnd(3, 'N'), false);
    if (set.length === 1 && set !== '*') { possible.push(set); residues.push(set); }
  }
  if (possible.at(-1) === '*') { possible.pop(); residues.pop(); }
  const threePrimeIndeterminate = !!possible.at(-1)?.includes('*') && possible.at(-1) !== '*';
  return { status: 'ok', residues: residues.join(''), possible, internalStops: possible.flatMap((p, i) => p === '*' ? [i] : []), threePrimeIndeterminate, alignedIndices: alignedIndices.slice(0, residues.length * 3) };
}

export function compareTranslation(stored: string, conceptual: Extract<ConceptualTranslation, { status: 'ok' }>) {
  const differing: number[] = [];
  for (let i = 0; i < Math.min(stored.length, conceptual.residues.length); i++) {
    const actual = stored[i]; const expected = conceptual.residues[i];
    if (actual === expected) continue;
    if (expected !== '*' && (actual === 'X' || conceptual.possible[i].includes(actual))) continue;
    differing.push(i);
  }
  return { differing, storedExtra: stored.slice(conceptual.residues.length), storedShortBy: Math.max(0, conceptual.residues.length - stored.length) };
}

/** Disposable JSON cache fits the string-valued qualifier metadata contract. */
export function checkTranslation(feature: BioFeature, record: Pick<SeqRecord, 'sequence' | 'moleculeType'>): BioFeature {
  if (!isCds(feature)) return feature;
  const conceptual = conceptualTranslation(feature, record);
  const stored = storedTranslation(feature);
  const comparison = stored && conceptual.status === 'ok' ? compareTranslation(stored, conceptual) : undefined;
  return { ...feature, metadata: { ...feature.metadata, ...(stored && !feature.metadata?._translationSource ? { _translationSource: 'imported' } : {}), _translationCheck: JSON.stringify({ ...conceptual, comparison }) } };
}
export function translationWarning(records: SeqRecord[]): string | null {
  let count = 0;
  for (const record of records) for (const f of record.features) {
    if (!isCds(f) || f.metadata?.exception !== undefined) continue;
    const stored = storedTranslation(f); const result = conceptualTranslation(f, record);
    if (!stored || result.status !== 'ok') continue;
    const c = compareTranslation(stored, result);
    if (c.differing.length || c.storedExtra || c.storedShortBy) count++;
  }
  return count ? `WARNING: ${count} CDS have a /translation that differs from their DNA` : null;
}
export function translationReason(result: ConceptualTranslation, feature: BioFeature): string {
  if (result.status === 'ok') return result.internalStops.length ? `internal stop at codon ${result.internalStops[0] + 1}; fix the CDS or mark it /pseudo` : '';
  return ({ 'protein-record': 'nucleotide translation is not applicable to a protein record', 'invalid-code': `/transl_table=${feature.metadata?.transl_table ?? ''} is not an NCBI genetic code`, 'unsupported-exception': "/transl_except can't be applied yet", 'unknown-strand': 'biological strand is unknown', 'nonlocal-location': 'location does not define one locally available sequence', 'unknown-completeness': 'CDS end completeness cannot be established', empty: 'CDS has no translatable coding bases' })[result.reason];
}

/** Fill omitted interval orientations only in the per-interval evaluation path (LOC-3). */
export function resolvedTranslationFeature(feature: BioFeature): BioFeature {
  return feature.segments?.some(s => s.strand !== undefined)
    ? { ...feature, segments: feature.segments.map(s => ({ ...s, strand: s.strand ?? feature.strand })) } : feature;
}

/** Import/save/load own cache invalidation; redraws consume that disposable result. */
export function checkedTranslation(feature: BioFeature, record: Pick<SeqRecord, 'sequence' | 'moleculeType'>): ConceptualTranslation {
  if (feature.metadata?._translationCheck) {
    try {
      return JSON.parse(feature.metadata._translationCheck) as ConceptualTranslation;
    } catch {
      return conceptualTranslation(feature, record);
    }
  }
  return conceptualTranslation(feature, record);
}

export function translationDescription(feature: BioFeature, record: Pick<SeqRecord, 'sequence' | 'moleculeType'>): string {
  const result = checkedTranslation(feature, record);
  const clauses = [feature.metadata?._translationMessage ?? ''];
  if (result.status === 'unavailable') clauses.push(`Can't verify: ${translationReason(result, feature)}`);
  const stored = storedTranslation(feature);
  if (stored && result.status === 'ok') {
    const comparison = compareTranslation(stored, result);
    if (comparison.differing.length) clauses.push(`Annotation differs from DNA at ${comparison.differing.length} codon${comparison.differing.length === 1 ? '' : 's'}`);
    for (const [n, direction] of [[comparison.storedExtra.length, 'longer'], [comparison.storedShortBy, 'shorter']] as const) {
      if (n) clauses.push(`Annotated protein is ${n} translation position${n === 1 ? '' : 's'} ${direction} than the DNA-derived protein`);
    }
    if (feature.metadata?.exception) clauses.push(`/exception: ${feature.metadata.exception}`);
  }
  return clauses.filter(Boolean).join('. ');
}
